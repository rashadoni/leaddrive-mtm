export type RouteDataOrigin = "none" | "live" | "cache"
export type RouteLoadIssue = "none" | "offline" | "timeout"

export type RouteBannerMode = "cached" | "offline-retained" | "slow-retained" | null
export type RouteEmptyMode = "loading" | "offline-unavailable" | "slow-unavailable" | "awaiting-approval" | "no-route" | null

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
  awaitingApproval = false,
}: {
  loading: boolean
  hasRoute: boolean
  routeOrigin: RouteDataOrigin
  issue: RouteLoadIssue
  /** Today has a route that is saved but not approved yet (see below). */
  awaitingApproval?: boolean
}): RouteScreenPresentation {
  if (!hasRoute) {
    if (loading) return { banner: null, empty: "loading" }
    if (issue === "offline") return { banner: null, empty: "offline-unavailable" }
    if (issue === "timeout") return { banner: null, empty: "slow-unavailable" }
    if (awaitingApproval) return { banner: null, empty: "awaiting-approval" }
    return { banner: null, empty: "no-route" }
  }

  if (routeOrigin === "cache") return { banner: "cached", empty: null }
  if (issue === "offline") return { banner: "offline-retained", empty: null }
  if (issue === "timeout") return { banner: "slow-retained", empty: null }
  return { banner: null, empty: null }
}

/**
 * Whether today has a route the server holds as a draft with stops in it.
 *
 * Tablet in the field, 2026-10-06: an agent who may not publish his own routes
 * built today's route, read «Marşrut yadda saxlanıldı», went back — and the
 * Route tab still said «Bu gün marşrut yoxdur» and offered to build a route
 * again. The route was on the server all along, as a draft waiting for the
 * manager; the same read that fills this tab had returned it, and the tab
 * dropped it for not being PLANNED. A saved route that is not approved yet is
 * not «no route», and the screen must say which of the two it is.
 *
 * A draft with no stops is not a route anyone is waiting on: the agent took
 * everything out again. The server sends `date` as an ISO string; only its
 * calendar day is compared, as everywhere else on this screen.
 */
export function routeAwaitsApproval(routes: unknown, today: string): boolean {
  if (!Array.isArray(routes)) return false
  return routes.some((candidate) => {
    if (!candidate || typeof candidate !== "object") return false
    const route = candidate as { status?: unknown; date?: unknown; totalPoints?: unknown; points?: unknown }
    if (route.status !== "DRAFT") return false
    if (typeof route.date !== "string" || route.date.slice(0, 10) !== today) return false
    const stops = Array.isArray(route.points)
      ? route.points.length
      : typeof route.totalPoints === "number" ? route.totalPoints : 0
    return stops > 0
  })
}

export type RouteActionPanelState =
  | "loading"
  | "visit"
  | "point"
  | "gate-workday"
  | "gate-route"
  | "gate-paused"
  | "route-unknown"
  | "finished"

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
  // Redmi Pad SE, 2026-09-15: after the last visit the tab said «no route
  // today» and asked to start the route that had just been finished.
  if (hasRoute && routeStatus === "COMPLETED") return "finished"
  if (workdayActive && hasRoute && routeStatus === "IN_PROGRESS") return "point"
  if (workdayPaused) return "gate-paused"
  if (workdayActive) return hasRoute || routeKnownAbsent ? "gate-route" : "route-unknown"
  return "gate-workday"
}
