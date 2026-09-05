import type { SyncPhase } from "../store/sync-status"

export type SyncChipInput = {
  phase: SyncPhase
  /** Device connectivity from NetInfo; null until the first event. */
  online: boolean | null
  conflicts: number
  outstanding: number
}

export type SyncChipLabel =
  | { key: "syncCenter.syncing" }
  | { key: "syncCenter.conflictsShort"; count: number }
  | { key: "syncCenter.offlinePending"; count: number }
  | { key: "syncCenter.offline" }
  | { key: "syncCenter.pendingShort"; count: number }
  | { key: "syncCenter.synced" }

/**
 * What the sync chip says (field UX audit M-06, task B4). Connectivity wins
 * over a stale "synced": with the radio off the app must never claim it is
 * in sync, whatever the last sync run recorded.
 */
export function syncChipLabel(input: SyncChipInput): SyncChipLabel {
  const offline = input.online === false || input.phase === "offline"
  if (input.phase === "syncing" && !offline) return { key: "syncCenter.syncing" }
  if (input.conflicts > 0) return { key: "syncCenter.conflictsShort", count: input.conflicts }
  if (offline) {
    return input.outstanding > 0
      ? { key: "syncCenter.offlinePending", count: input.outstanding }
      : { key: "syncCenter.offline" }
  }
  if (input.outstanding > 0) return { key: "syncCenter.pendingShort", count: input.outstanding }
  return { key: "syncCenter.synced" }
}
