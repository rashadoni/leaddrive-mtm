import { api } from "./api"
import { allOutboxOperations, flushOutbox } from "./outbox"
import { allMediaUploads, flushMediaOutbox, type MediaOutboxItem } from "./media-outbox"
import { pullAndApplySync } from "./sync-cache"
import { offlineScopeKey } from "./offline-scope"
import { retryAfterMsFromError } from "./sync-retry"
import { useAuthStore } from "../store/auth"
import { useSyncStatusStore, type SyncPipelineId } from "../store/sync-status"

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
      await useSyncStatusStore.getState().deferPipeline({
        scopeKey: input.scopeKey,
        pipeline: input.pipeline,
        error: failure.error,
        retryAfterMs: failure.retryAfterMs,
      })
      return { result, failed: true, skipped: false, error: failure.error }
    }
    await useSyncStatusStore.getState().completePipeline(input.scopeKey, input.pipeline)
    return { result, failed: false, skipped: false }
  } catch (error) {
    const failure = failureFromError(error, "SYNC_PIPELINE_FAILED")
    await useSyncStatusStore.getState().deferPipeline({
      scopeKey: input.scopeKey,
      pipeline: input.pipeline,
      error: failure.error,
      retryAfterMs: failure.retryAfterMs,
    })
    return { failed: true, skipped: false, error: failure.error }
  }
}

async function performSync(): Promise<MobileSyncResult> {
  const agent = useAuthStore.getState().agent
  const scopeKey = offlineScopeKey(agent?.organizationId, agent?.id)
  if (!agent || !scopeKey) return { success: false, sent: 0, deferred: 0, conflicted: 0, mediaSent: 0 }

  const status = useSyncStatusStore.getState()
  await status.hydrate(scopeKey)
  useSyncStatusStore.getState().begin(scopeKey)

  // Keep v1 writes authoritative. The later v2 routes adapter is a
  // read-only replacement for this pull lane only; it must never introduce
  // a second mutation submission path.
  const outboxPipeline = await runPipeline({
    scopeKey,
    pipeline: "routeOutbox",
    execute: () => flushOutbox((operations) => api.syncPush(operations)),
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
  const pipelineErrors = [outboxPipeline, pullPipeline, mediaPipeline]
    .filter((pipeline) => pipeline.failed)
    .map((pipeline) => pipeline.error ?? "SYNC_PIPELINE_FAILED")

  if (pipelineErrors.length > 0) {
    useSyncStatusStore.getState().fail(scopeKey, pipelineErrors[0], nextCounts)
  } else {
    await useSyncStatusStore.getState().complete(scopeKey, nextCounts)
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
