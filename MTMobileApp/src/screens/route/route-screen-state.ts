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
 * before — including a loaded day with no route.
 */
export function routeActionPanelState({
  loading,
  hasRoute,
  routeStatus,
  workdayHydrated,
  workdayActive,
  workdayPaused,
  hasActiveVisit,
  activeVisitKnown,
}: {
  loading: boolean
  hasRoute: boolean
  routeStatus: string | null | undefined
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
  if (workdayActive) return "gate-route"
  return "gate-workday"
}
