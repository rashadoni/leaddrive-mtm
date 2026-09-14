export type RouteDataOrigin = "none" | "live" | "cache"
export type RouteLoadIssue = "none" | "offline" | "timeout"

export type RouteBannerMode = "cached" | "offline-retained" | "slow-retained" | null
export type RouteEmptyMode = "loading" | "offline-unavailable" | "slow-unavailable" | "no-route" | null

export interface RouteScreenPresentation {
  banner: RouteBannerMode
  empty: RouteEmptyMode
}

/**
 * Keeps route availability and connection copy honest. A cached route may be
 * called saved; a previously loaded in-memory route may only be called
 * retained; and a failed request with no data must render a retryable empty
 * state instead of an offline banner that claims a route exists.
 */
export function routeScreenPresentation({
  loading,
  hasRoute,
  routeOrigin,
  issue,
}: {
  loading: boolean
  hasRoute: boolean
  routeOrigin: RouteDataOrigin
  issue: RouteLoadIssue
}): RouteScreenPresentation {
  if (!hasRoute) {
    if (loading) return { banner: null, empty: "loading" }
    if (issue === "offline") return { banner: null, empty: "offline-unavailable" }
    if (issue === "timeout") return { banner: null, empty: "slow-unavailable" }
    return { banner: null, empty: "no-route" }
  }

  if (routeOrigin === "cache") return { banner: "cached", empty: null }
  if (issue === "offline") return { banner: "offline-retained", empty: null }
  if (issue === "timeout") return { banner: "slow-retained", empty: null }
  return { banner: null, empty: null }
}

export type RouteActionPanelState =
  | "loading"
  | "visit"
  | "point"
  | "gate-workday"
  | "gate-route"
  | "gate-paused"
  | "route-unknown"

/**
 * Picks what the action panel may say, and says nothing until it knows.
 *
 * Galaxy S23, 2026-09-14: right after opening the Route tab the panel read
 * «Marşrutun başlanması gözlənilir» and asked for «Marşruta başla» beside
 * «Marşrut və ziyarətlər yüklənir…» and «0 dayanacaq». The route was already
 * IN_PROGRESS; a few seconds later the real panel replaced the order. A null
 * route while the first request runs is not a route that waits to start, an
 * unread workday store is not a day that was never started, and an unread
 * visit list is not a free hand to check in somewhere else. Each of those
 * shows a neutral wait instead of an instruction.
 *
 * An open visit is the one fact that outranks the rest: it is already on the
 * device, so a refetch or a slow store must never hide the visit controls.
 * Once everything is read, the choice is exactly the one the screen made
 * before — including a day the server said has no route.
 *
 * A read that failed is not such a day. Offline or after the 20 s timeout,
 * with no saved copy for today, the route may well be IN_PROGRESS on the
 * server; the list already says it could not load and offers a retry, so the
 * panel says nothing rather than ask for «Marşruta başla» (the tablet pane —
 * and the S23 held sideways, 823 dp — draws the panel without a route).
 * `routeKnownAbsent` is the outcome of the last read that finished, not the
 * live load issue: a timed refetch clears that issue the moment it starts,
 * and the old order would flash back for the whole request. The workday and
 * pause gates stay — they come from the device, not from the route.
 */
export function routeActionPanelState({
  loading,
  hasRoute,
  routeStatus,
  routeKnownAbsent,
  workdayHydrated,
  workdayActive,
  workdayPaused,
  hasActiveVisit,
  activeVisitKnown,
}: {
  loading: boolean
  hasRoute: boolean
  routeStatus: string | null | undefined
  routeKnownAbsent: boolean
  workdayHydrated: boolean
  workdayActive: boolean
  workdayPaused: boolean
  hasActiveVisit: boolean
  activeVisitKnown: boolean
}): RouteActionPanelState {
  if (hasActiveVisit) return "visit"
  if (!workdayHydrated || !activeVisitKnown || (loading && !hasRoute)) return "loading"
  if (workdayActive && hasRoute && routeStatus === "IN_PROGRESS") return "point"
  if (workdayPaused) return "gate-paused"
  if (workdayActive) return hasRoute || routeKnownAbsent ? "gate-route" : "route-unknown"
  return "gate-workday"
}
