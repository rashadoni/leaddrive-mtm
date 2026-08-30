import AsyncStorage from "@react-native-async-storage/async-storage"
import { create } from "zustand"
import { routeFieldStorageKey } from "../runtime/route-field-profile"
import { retryDelayMs } from "../services/sync-retry"

export type SyncPhase = "idle" | "syncing" | "offline" | "error"
export type SyncPipelineId = "routeOutbox" | "routePull" | "routeV2Pull" | "media"
export type SyncPipelinePhase = "idle" | "syncing" | "backoff" | "error" | "disabled"

export type SyncPipelineStatus = {
  phase: SyncPipelinePhase
  attempts: number
  retryAt: number | null
  lastError: string | null
  lastSucceededAt: string | null
  /** v2 cohort epoch that explicitly disabled this pipeline, if any. */
  disabledEpoch: string | null
}

export type SyncPipelines = Record<SyncPipelineId, SyncPipelineStatus>

type SyncCounts = {
  pending: number
  conflicts: number
  mediaPending: number
}

type SyncStatusState = SyncCounts & {
  scopeKey: string | null
  phase: SyncPhase
  lastSyncedAt: string | null
  lastError: string | null
  pipelines: SyncPipelines
  hydrate: (scopeKey: string) => Promise<void>
  begin: (scopeKey: string) => void
  complete: (scopeKey: string, counts: SyncCounts) => Promise<void>
  fail: (scopeKey: string, error: string, counts: SyncCounts) => void
  beginPipeline: (scopeKey: string, pipeline: SyncPipelineId, now?: number) => boolean
  completePipeline: (scopeKey: string, pipeline: SyncPipelineId) => Promise<void>
  deferPipeline: (input: {
    scopeKey: string
    pipeline: SyncPipelineId
    error: string
    retryAfterMs?: number
    now?: number
    random?: () => number
  }) => Promise<number>
  /** Returns false when the current server epoch has already disabled it. */
  enablePipeline: (scopeKey: string, pipeline: SyncPipelineId, epoch?: string | null) => Promise<boolean>
  disablePipeline: (scopeKey: string, pipeline: SyncPipelineId, reason?: string, epoch?: string | null) => Promise<void>
  setOffline: (counts?: Partial<SyncCounts>) => void
  updateCounts: (counts: SyncCounts) => void
  clear: () => void
}

const STORAGE_PREFIX = routeFieldStorageKey("sync-status")

const PIPELINES: readonly SyncPipelineId[] = ["routeOutbox", "routePull", "routeV2Pull", "media"]

function emptyPipeline(): SyncPipelineStatus {
  return {
    phase: "idle",
    attempts: 0,
    retryAt: null,
    lastError: null,
    lastSucceededAt: null,
    disabledEpoch: null,
  }
}

function emptyPipelines(): SyncPipelines {
  return {
    routeOutbox: emptyPipeline(),
    routePull: emptyPipeline(),
    routeV2Pull: emptyPipeline(),
    media: emptyPipeline(),
  }
}

function parsePipelines(value: unknown): SyncPipelines {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {}
  const result = emptyPipelines()
  for (const pipeline of PIPELINES) {
    const item = raw[pipeline]
    if (!item || typeof item !== "object") continue
    const entry = item as Record<string, unknown>
    const phase = entry.phase
    result[pipeline] = {
      phase: phase === "idle" || phase === "syncing" || phase === "backoff" || phase === "error" || phase === "disabled"
        ? phase
        : "idle",
      attempts: typeof entry.attempts === "number" && Number.isFinite(entry.attempts)
        ? Math.max(0, Math.floor(entry.attempts))
        : 0,
      retryAt: typeof entry.retryAt === "number" && Number.isFinite(entry.retryAt) ? entry.retryAt : null,
      lastError: typeof entry.lastError === "string" ? entry.lastError : null,
      lastSucceededAt: typeof entry.lastSucceededAt === "string" ? entry.lastSucceededAt : null,
      disabledEpoch: typeof entry.disabledEpoch === "string" && entry.disabledEpoch.length > 0
        ? entry.disabledEpoch
        : null,
    }
  }
  return result
}

function storageKey(scopeKey: string) {
  return `${STORAGE_PREFIX}:${scopeKey}`
}

function persisted(state: Pick<SyncStatusState, "lastSyncedAt" | "pipelines">) {
  return { lastSyncedAt: state.lastSyncedAt, pipelines: state.pipelines }
}

export const useSyncStatusStore = create<SyncStatusState>((set, get) => ({
  scopeKey: null,
  phase: "idle",
  pending: 0,
  conflicts: 0,
  mediaPending: 0,
  lastSyncedAt: null,
  lastError: null,
  pipelines: emptyPipelines(),

  hydrate: async (scopeKey) => {
    if (get().scopeKey === scopeKey) return
    const raw = await AsyncStorage.getItem(storageKey(scopeKey))
    let lastSyncedAt: string | null = null
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { lastSyncedAt?: unknown; pipelines?: unknown }
        if (typeof parsed.lastSyncedAt === "string") lastSyncedAt = parsed.lastSyncedAt
        const pipelines = parsePipelines(parsed.pipelines)
        set({
          scopeKey,
          phase: "idle",
          pending: 0,
          conflicts: 0,
          mediaPending: 0,
          lastSyncedAt,
          lastError: null,
          pipelines,
        })
        return
      } catch {}
    }
    set({
      scopeKey,
      phase: "idle",
      pending: 0,
      conflicts: 0,
      mediaPending: 0,
      lastSyncedAt,
      lastError: null,
      pipelines: emptyPipelines(),
    })
  },

  begin: (scopeKey) => set({ scopeKey, phase: "syncing", lastError: null }),

  complete: async (scopeKey, counts) => {
    const lastSyncedAt = new Date().toISOString()
    set({ scopeKey, phase: "idle", ...counts, lastSyncedAt, lastError: null })
    await AsyncStorage.setItem(storageKey(scopeKey), JSON.stringify(persisted({
      lastSyncedAt,
      pipelines: get().pipelines,
    })))
  },

  fail: (scopeKey, error, counts) => set({
    scopeKey,
    phase: "error",
    ...counts,
    lastError: error,
  }),

  beginPipeline: (scopeKey, pipeline, now = Date.now()) => {
    const state = get()
    if (state.scopeKey !== scopeKey) return false
    const current = state.pipelines[pipeline]
    if (current.phase === "disabled" || (current.retryAt !== null && current.retryAt > now)) return false
    set({
      pipelines: {
        ...state.pipelines,
        [pipeline]: { ...current, phase: "syncing", lastError: null },
      },
    })
    return true
  },

  completePipeline: async (scopeKey, pipeline) => {
    const state = get()
    if (state.scopeKey !== scopeKey) return
    const next: SyncPipelines = {
      ...state.pipelines,
      [pipeline]: {
        phase: "idle",
        attempts: 0,
        retryAt: null,
        lastError: null,
        lastSucceededAt: new Date().toISOString(),
        disabledEpoch: null,
      },
    }
    set({ pipelines: next })
    await AsyncStorage.setItem(storageKey(scopeKey), JSON.stringify(persisted({
      lastSyncedAt: get().lastSyncedAt,
      pipelines: next,
    })))
  },

  deferPipeline: async ({ scopeKey, pipeline, error, retryAfterMs, now = Date.now(), random }) => {
    const state = get()
    if (state.scopeKey !== scopeKey) return now
    const current = state.pipelines[pipeline]
    const attempts = current.attempts + 1
    const retryAt = now + retryDelayMs({ attempts, retryAfterMs, jitter: true, random })
    const next: SyncPipelines = {
      ...state.pipelines,
      [pipeline]: {
        ...current,
        phase: "backoff",
        attempts,
        retryAt,
        lastError: error,
      },
    }
    set({ pipelines: next })
    await AsyncStorage.setItem(storageKey(scopeKey), JSON.stringify(persisted({
      lastSyncedAt: get().lastSyncedAt,
      pipelines: next,
    })))
    return retryAt
  },

  disablePipeline: async (scopeKey, pipeline, reason, epoch) => {
    const state = get()
    if (state.scopeKey !== scopeKey) return
    const next: SyncPipelines = {
      ...state.pipelines,
      [pipeline]: {
        ...state.pipelines[pipeline],
        phase: "disabled",
        retryAt: null,
        lastError: reason ?? null,
        disabledEpoch: epoch && epoch.length > 0 ? epoch : null,
      },
    }
    set({ pipelines: next })
    await AsyncStorage.setItem(storageKey(scopeKey), JSON.stringify(persisted({
      lastSyncedAt: get().lastSyncedAt,
      pipelines: next,
    })))
  },

  enablePipeline: async (scopeKey, pipeline, epoch) => {
    const state = get()
    if (state.scopeKey !== scopeKey) return false
    const current = state.pipelines[pipeline]
    // A cohort withdrawal must survive ordinary supervisor passes. Only a
    // fresh bootstrap epoch may re-arm it; otherwise a stale manifest would
    // poll the endpoint repeatedly after a server-first rollback.
    if (current.phase !== "disabled") return true
    if (current.disabledEpoch && current.disabledEpoch === epoch) return false
    const next: SyncPipelines = {
      ...state.pipelines,
      [pipeline]: emptyPipeline(),
    }
    set({ pipelines: next })
    await AsyncStorage.setItem(storageKey(scopeKey), JSON.stringify(persisted({
      lastSyncedAt: get().lastSyncedAt,
      pipelines: next,
    })))
    return true
  },

  setOffline: (counts) => set((state) => ({
    phase: "offline",
    pending: counts?.pending ?? state.pending,
    conflicts: counts?.conflicts ?? state.conflicts,
    mediaPending: counts?.mediaPending ?? state.mediaPending,
  })),

  updateCounts: (counts) => set(counts),

  clear: () => set({
    scopeKey: null,
    phase: "idle",
    pending: 0,
    conflicts: 0,
    mediaPending: 0,
    lastSyncedAt: null,
    lastError: null,
    pipelines: emptyPipelines(),
  }),
}))
