import AsyncStorage from "@react-native-async-storage/async-storage"
import { create } from "zustand"

export type SyncPhase = "idle" | "syncing" | "offline" | "error"

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
  hydrate: (scopeKey: string) => Promise<void>
  begin: (scopeKey: string) => void
  complete: (scopeKey: string, counts: SyncCounts) => Promise<void>
  fail: (scopeKey: string, error: string, counts: SyncCounts) => void
  setOffline: (counts?: Partial<SyncCounts>) => void
  updateCounts: (counts: SyncCounts) => void
  clear: () => void
}

const STORAGE_PREFIX = "@mtm_sync_status_v1:"

function storageKey(scopeKey: string) {
  return `${STORAGE_PREFIX}${scopeKey}`
}

export const useSyncStatusStore = create<SyncStatusState>((set, get) => ({
  scopeKey: null,
  phase: "idle",
  pending: 0,
  conflicts: 0,
  mediaPending: 0,
  lastSyncedAt: null,
  lastError: null,

  hydrate: async (scopeKey) => {
    if (get().scopeKey === scopeKey) return
    const raw = await AsyncStorage.getItem(storageKey(scopeKey))
    let lastSyncedAt: string | null = null
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { lastSyncedAt?: unknown }
        if (typeof parsed.lastSyncedAt === "string") lastSyncedAt = parsed.lastSyncedAt
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
    })
  },

  begin: (scopeKey) => set({ scopeKey, phase: "syncing", lastError: null }),

  complete: async (scopeKey, counts) => {
    const lastSyncedAt = new Date().toISOString()
    set({ scopeKey, phase: "idle", ...counts, lastSyncedAt, lastError: null })
    await AsyncStorage.setItem(storageKey(scopeKey), JSON.stringify({ lastSyncedAt }))
  },

  fail: (scopeKey, error, counts) => set({
    scopeKey,
    phase: "error",
    ...counts,
    lastError: error,
  }),

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
  }),
}))
