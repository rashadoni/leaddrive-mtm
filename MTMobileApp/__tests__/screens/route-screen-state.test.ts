import { routeScreenPresentation } from "../../src/screens/route/route-screen-state"

describe("route screen presentation", () => {
  it("calls a route saved only when a real cached route is visible", () => {
    expect(routeScreenPresentation({
      loading: false,
      hasRoute: true,
      routeOrigin: "cache",
      issue: "offline",
    })).toEqual({ banner: "cached", empty: null })
  })

  it("keeps offline without cached data in a retryable empty state", () => {
    expect(routeScreenPresentation({
      loading: false,
      hasRoute: false,
      routeOrigin: "none",
      issue: "offline",
    })).toEqual({ banner: null, empty: "offline-unavailable" })
  })

  it("keeps a timeout without data in a distinct retryable empty state", () => {
    expect(routeScreenPresentation({
      loading: false,
      hasRoute: false,
      routeOrigin: "none",
      issue: "timeout",
    })).toEqual({ banner: null, empty: "slow-unavailable" })
  })

  it("does not describe an in-memory route as saved after refresh fails", () => {
    expect(routeScreenPresentation({
      loading: false,
      hasRoute: true,
      routeOrigin: "live",
      issue: "offline",
    })).toEqual({ banner: "offline-retained", empty: null })

    expect(routeScreenPresentation({
      loading: false,
      hasRoute: true,
      routeOrigin: "live",
      issue: "timeout",
    })).toEqual({ banner: "slow-retained", empty: null })
  })

  it("keeps loading and successful no-route states separate from failures", () => {
    expect(routeScreenPresentation({
      loading: true,
      hasRoute: false,
      routeOrigin: "none",
      issue: "none",
    }).empty).toBe("loading")

    expect(routeScreenPresentation({
      loading: false,
      hasRoute: false,
      routeOrigin: "none",
      issue: "none",
    }).empty).toBe("no-route")
  })
})
