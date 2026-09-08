/**
 * What the sync centre may offer right now (field UX audit 2026-09-05, task T8).
 *
 * The sheet knew the device was offline — the store publishes connectivity —
 * and showed nothing about it. "Синхронизировать" stayed enabled, the agent
 * pressed it with the radio off, and got a spinner that ended in nothing.
 * Pressing a live button and having nothing happen teaches people that the
 * app is broken.
 *
 * Two separate reasons must not be merged into one greyed-out button: no
 * Route Field access is a permission the agent cannot change, no network is a
 * state that fixes itself. The caller shows a different line for each.
 */
export type SyncCentreState = {
  /** Whether "sync now" does anything if pressed. */
  canSyncNow: boolean
  /** Line explaining why not, from the `syncCenter` namespace; null when it can. */
  noticeKey: string | null
}

export function syncCentreState(input: {
  online: boolean | null | undefined
  hasRouteFieldAccess: boolean
  busy?: boolean
}): SyncCentreState {
  if (!input.hasRouteFieldAccess) {
    return { canSyncNow: false, noticeKey: "routeFieldAccess.syncBlocked" }
  }
  if (input.online === false) {
    // Not an error and not the agent's fault: the queue drains by itself when
    // the network returns, and saying so is the whole point of the line.
    return { canSyncNow: false, noticeKey: "syncCenter.offlineCannotSync" }
  }
  if (input.busy) return { canSyncNow: false, noticeKey: null }
  // Connectivity unknown is not a reason to forbid the attempt: the request
  // will tell us more than NetInfo's silence.
  return { canSyncNow: true, noticeKey: null }
}
