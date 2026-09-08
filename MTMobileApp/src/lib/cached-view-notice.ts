/**
 * Why a screen is showing saved data (field UX audit 2026-09-05, task T7).
 *
 * The contacts and calendar screens decided "you are offline" from a single
 * fact: the request failed. A 500, a timeout, a malformed answer — all of it
 * told the agent their connection was gone while the phone had full signal.
 * That sends them to a settings screen to fix a network that works, and hides
 * the real problem from anyone reading the report afterwards.
 *
 * Connectivity is a separate fact and the app already knows it (the sync store
 * publishes it from NetInfo). The two facts together give an honest answer;
 * either one alone gives a guess.
 */
export type CachedViewNotice =
  /** The radio is off. Saved data is all there is, and that is expected. */
  | "offline"
  /** Online, but the server did not answer properly. Not the agent's fault. */
  | "server-error"
  /** Failed with connectivity unknown: say the data is saved, claim no cause. */
  | "stale"
  /** Nothing to say. */
  | "none"

export function cachedViewNotice(input: {
  /** From the sync store: true, false, or null while it is not known yet. */
  online: boolean | null | undefined
  /** The last load attempt failed. */
  requestFailed: boolean
}): CachedViewNotice {
  if (!input.requestFailed) return "none"
  if (input.online === false) return "offline"
  if (input.online === true) return "server-error"
  return "stale"
}

/** Translation key for each notice, in the app's `common` namespace. */
export const CACHED_VIEW_NOTICE_KEYS: Record<Exclude<CachedViewNotice, "none">, string> = {
  offline: "common.offlineCached",
  "server-error": "common.cachedServerError",
  stale: "common.cachedStale",
}
