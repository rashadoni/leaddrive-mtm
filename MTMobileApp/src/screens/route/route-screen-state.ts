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
