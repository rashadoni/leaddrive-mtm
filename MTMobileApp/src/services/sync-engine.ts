import { api } from "./api"
import { allOutboxOperations, flushOutbox } from "./outbox"
import { allMediaUploads, flushMediaOutbox, type MediaOutboxItem } from "./media-outbox"
import { pullAndApplySync } from "./sync-cache"
import { clearRouteV2RoutesState, syncRouteV2Routes, type RouteV2SyncOutcome } from "./sync-v2-routes"
import { offlineScopeKey } from "./offline-scope"
import { retryAfterMsFromError } from "./sync-retry"
import { useAuthStore } from "../store/auth"
import { useBootstrapStore } from "../store/bootstrap"
import { useSyncStatusStore, type SyncPipelineId } from "../store/sync-status"
import { hasRouteFieldAccess } from "./bootstrap"

let activeSync: Promise<MobileSyncResult> | null = null

export type MobileSyncResult = {
  success: boolean
  sent: number
  deferred: number
  conflicted: number
  mediaSent: number
}

type PipelineFailure = { error: string; retryAfterMs?: number }
type PipelineRun<T> = { result?: T; failed: boolean; skipped: boolean; error?: string }

/** Auxiliary status/cache persistence is never an authority over a queue. */
async function bestEffortAuxiliaryWrite(write: () => Promise<unknown>) {
  try {
    await write()
  } catch {}
}

async function counts() {
  const [operations, media] = await Promise.all([allOutboxOperations(), allMediaUploads()])
  return {
    pending: operations.filter((item) => item.status === "pending").length,
    conflicts: operations.filter((item) => item.status === "conflict").length,
    mediaPending: media.length,
  }
}

export async function refreshSyncStatusCounts() {
  const next = await counts()
  useSyncStatusStore.getState().updateCounts(next)
  return next
}

/**
 * The only adapter for a Route Field UI action that wants to drain the legacy
 * v1 mutation queue immediately. It deliberately leaves the queue untouched
 * when the current server bootstrap has not admitted this APK.
 */
export async function flushRouteFieldOutbox() {
  if (!hasRouteFieldAccess(useBootstrapStore.getState().routeFieldAccess)) {
    return { sent: 0, deferred: 0, conflicted: 0 }
  }
  return flushOutbox((operations) => api.syncPush(operations))
}

function failureFromError(error: unknown, fallback: string): PipelineFailure {
  return {
    error: error instanceof Error && error.message ? error.message : fallback,
    retryAfterMs: retryAfterMsFromError(error),
  }
}

/**
 * A supervisor pipeline is isolated by design: a pull/media failure records a
 * stream-local backoff but never prevents a later independent pipeline from
 * draining its durable queue.  `beginPipeline` also suppresses eager retries
 * while a persisted Retry-After/backoff window remains active.
 */
async function runPipeline<T>(input: {
  scopeKey: string
  pipeline: SyncPipelineId
  execute: () => Promise<T>
  resultFailure?: (result: T) => PipelineFailure | null
}): Promise<PipelineRun<T>> {
  const status = useSyncStatusStore.getState()
  if (!status.beginPipeline(input.scopeKey, input.pipeline)) {
    const current = useSyncStatusStore.getState().pipelines[input.pipeline]
    return { failed: current.phase === "backoff", skipped: true, error: current.lastError ?? undefined }
  }

  try {
    const result = await input.execute()
    const failure = input.resultFailure?.(result) ?? null
    if (failure) {
      await bestEffortAuxiliaryWrite(() => useSyncStatusStore.getState().deferPipeline({
        scopeKey: input.scopeKey,
        pipeline: input.pipeline,
        error: failure.error,
        retryAfterMs: failure.retryAfterMs,
      }))
      return { result, failed: true, skipped: false, error: failure.error }
    }
    await bestEffortAuxiliaryWrite(() => useSyncStatusStore.getState().completePipeline(input.scopeKey, input.pipeline))
    return { result, failed: false, skipped: false }
  } catch (error) {
    const failure = failureFromError(error, "SYNC_PIPELINE_FAILED")
    await bestEffortAuxiliaryWrite(() => useSyncStatusStore.getState().deferPipeline({
      scopeKey: input.scopeKey,
      pipeline: input.pipeline,
      error: failure.error,
      retryAfterMs: failure.retryAfterMs,
    }))
    return { failed: true, skipped: false, error: failure.error }
  }
}

async function performSync(): Promise<MobileSyncResult> {
  const agent = useAuthStore.getState().agent
  const scopeKey = offlineScopeKey(agent?.organizationId, agent?.id)
  if (!agent || !scopeKey) return { success: false, sent: 0, deferred: 0, conflicted: 0, mediaSent: 0 }
  // Bootstrap admission is the outer safety fence. Do not inspect, retry or
  // clear any v1 durable queue before it grants Route Field access: a tenant
  // can be disabled while an old APK still has v1 operations on disk.
  if (!hasRouteFieldAccess(useBootstrapStore.getState().routeFieldAccess)) {
    // v2 is a non-authoritative shadow projection. Unlike the v1 queues it is
    // safe and privacy-conservative to purge when the whole Field admission
    // is withdrawn; the clear is best effort and cannot block recovery.
    await bestEffortAuxiliaryWrite(() => clearRouteV2RoutesState(agent.organizationId, agent.id))
    return { success: false, sent: 0, deferred: 0, conflicted: 0, mediaSent: 0 }
  }

  const status = useSyncStatusStore.getState()
  try {
    await status.hydrate(scopeKey)
  } catch {
    // A status read failure must not adopt another tenant's in-memory retry
    // state and must never stop the v1 durable queues from progressing.
    useSyncStatusStore.getState().clear()
  }
  useSyncStatusStore.getState().begin(scopeKey)
  const bootstrap = useBootstrapStore.getState().data
  const manifest = bootstrap?.manifest
  const routeV2Epoch = manifest?.protocol.preferred === 2 && manifest.syncV2.routes === true
    ? manifest.syncV2.routesEpoch
    : null

  // Keep v1 writes authoritative. The later v2 routes adapter is a
  // read-only replacement for this pull lane only; it must never introduce
  // a second mutation submission path.
  const outboxPipeline = await runPipeline({
    scopeKey,
    pipeline: "routeOutbox",
    execute: () => flushRouteFieldOutbox(),
    resultFailure: (result) => {
      if (result.deferred === 0) return null
      const retry = result as typeof result & { error?: string; retryAfterMs?: number }
      return {
        error: retry.error ?? "SYNC_PUSH_RETRY_SCHEDULED",
        retryAfterMs: retry.retryAfterMs,
      }
    },
  })
  const outbox = outboxPipeline.result ?? { sent: 0, deferred: 0, conflicted: 0 }

  // Do not return early here. A temporary v1 pull outage must not prevent
  // media that belongs to an already-accepted visit from advancing, and vice
  // versa. The UI receives each pipeline's own state in sync-status.
  const pullPipeline = await runPipeline({
    scopeKey,
    pipeline: "routePull",
    execute: () => pullAndApplySync(agent.organizationId, agent.id, (since) => api.syncPull(since)),
  })

  // v2 is strictly a cohort-gated shadow read. It owns a separate opaque
  // cursor/cache and deliberately never changes the v1 UI projection or the
  // v1 mutation/outbox authority. A v2 outage therefore cannot block either.
  let routeV2Pipeline: PipelineRun<RouteV2SyncOutcome> | null = null
  if (!routeV2Epoch) {
    // Bootstrap withdrawal is server-first rollback. The shadow projection is
    // non-authoritative, so it is safe and privacy-conservative to discard;
    // importantly this never touches the v1 cache, mutation outbox or media.
    await bestEffortAuxiliaryWrite(() => clearRouteV2RoutesState(agent.organizationId, agent.id))
    await bestEffortAuxiliaryWrite(() => useSyncStatusStore.getState().disablePipeline(
      scopeKey,
      "routeV2Pull",
      "MOBILE_SYNC_V2_COHORT_DISABLED",
    ))
  } else {
    try {
      const v2Armed = await useSyncStatusStore.getState().enablePipeline(scopeKey, "routeV2Pull", routeV2Epoch)
      if (v2Armed) {
        routeV2Pipeline = await runPipeline({
          scopeKey,
          pipeline: "routeV2Pull",
          execute: () => syncRouteV2Routes({
            tenantId: agent.organizationId,
            agentId: agent.id,
            epoch: routeV2Epoch,
          }),
        })
      }
      if (routeV2Pipeline?.result?.status === "disabled") {
        await bestEffortAuxiliaryWrite(() => useSyncStatusStore.getState().disablePipeline(
          scopeKey,
          "routeV2Pull",
          routeV2Pipeline.result?.disabledReason ?? "MOBILE_SYNC_V2_COHORT_DISABLED",
          routeV2Epoch,
        ))
      }
    } catch (error) {
      // An auxiliary v2 status/cache write must be visible as a v2 failure,
      // but it may never skip the independent v1/media lanes below.
      routeV2Pipeline = { failed: true, skipped: false, error: failureFromError(error, "MOBILE_SYNC_V2_STATUS_UNAVAILABLE").error }
    }
  }

  const mediaPipeline = await runPipeline({
    scopeKey,
    pipeline: "media",
    execute: () => flushMediaOutbox((item: MediaOutboxItem) => api.uploadPhoto(item)),
    resultFailure: (result) => {
      if (result.deferred === 0) return null
      const retry = result as typeof result & { error?: string; retryAfterMs?: number }
      return {
        error: retry.error ?? "SYNC_MEDIA_RETRY_SCHEDULED",
        retryAfterMs: retry.retryAfterMs,
      }
    },
  })
  const media = mediaPipeline.result ?? { sent: 0, deferred: 0 }

  const nextCounts = await counts()
  const pipelineErrors = [outboxPipeline, pullPipeline, mediaPipeline, ...(routeV2Pipeline ? [routeV2Pipeline] : [])]
    .filter((pipeline) => pipeline.failed)
    .map((pipeline) => pipeline.error ?? "SYNC_PIPELINE_FAILED")

  if (pipelineErrors.length > 0) {
    useSyncStatusStore.getState().fail(scopeKey, pipelineErrors[0], nextCounts)
  } else {
    await bestEffortAuxiliaryWrite(() => useSyncStatusStore.getState().complete(scopeKey, nextCounts))
  }

  return {
    success: pipelineErrors.length === 0,
    sent: outbox.sent,
    deferred: outbox.deferred,
    conflicted: outbox.conflicted,
    mediaSent: media.sent,
  }
}

export function runMobileSync(): Promise<MobileSyncResult> {
  if (activeSync) return activeSync
  activeSync = performSync().finally(() => { activeSync = null })
  return activeSync
}

export async function markMobileOffline() {
  const nextCounts = await counts()
  useSyncStatusStore.getState().setOffline(nextCounts)
}
