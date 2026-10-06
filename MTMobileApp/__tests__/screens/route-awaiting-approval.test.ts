import fs from "fs"
import path from "path"
import { routeAwaitsApproval, routeScreenPresentation } from "../../src/screens/route/route-screen-state"

/**
 * Tablet in the field, 2026-10-06. The Route tab read «Bu gün marşrut yoxdur»
 * and offered «Mənim marşrutumu qur» to an agent who had built and saved
 * today's route a minute earlier. The route was on the server as a draft
 * waiting for the manager; the read that fills this tab had returned it, and
 * the tab dropped it for not being PLANNED.
 */
const source = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/route/RouteScreen.tsx"),
  "utf8",
)

const TODAY = "2026-10-06"

/** One route as `GET /routes?date=…&agentId=…` returns it to the agent's app. */
function serverRoute(overrides: Record<string, unknown> = {}) {
  return {
    id: "route-1",
    agentId: "agent-1",
    date: `${TODAY}T00:00:00.000Z`,
    status: "DRAFT",
    totalPoints: 1,
    version: 3,
    publishedVersion: null,
    points: [{ id: "point-1", customerId: "customer-1", orderIndex: 0 }],
    ...overrides,
  }
}

describe("route tab: a saved route that is not approved yet", () => {
  it("sees the draft the server returned for today", () => {
    expect(routeAwaitsApproval([serverRoute()], TODAY)).toBe(true)
  })

  it("does not take another day's draft for today's", () => {
    expect(routeAwaitsApproval([serverRoute({ date: "2026-10-07T00:00:00.000Z" })], TODAY)).toBe(false)
  })

  it("does not wait on a draft the agent emptied", () => {
    expect(routeAwaitsApproval([serverRoute({ totalPoints: 0, points: [] })], TODAY)).toBe(false)
    // A list read carries the count without the stops themselves.
    expect(routeAwaitsApproval([serverRoute({ totalPoints: 0, points: undefined })], TODAY)).toBe(false)
    expect(routeAwaitsApproval([serverRoute({ totalPoints: 2, points: undefined })], TODAY)).toBe(true)
  })

  it("is not about routes that are already approved, finished or cancelled", () => {
    const statuses = ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]
    expect(statuses.filter((status) => routeAwaitsApproval([serverRoute({ status })], TODAY))).toEqual([])
  })

  it("reads an empty or broken answer as nothing waiting", () => {
    expect([[], undefined, null, "routes", [null, 7, {}]].filter((routes) => routeAwaitsApproval(routes, TODAY))).toEqual([])
  })
})

describe("route tab: what it shows instead of «no route today»", () => {
  const noRoute = { loading: false, hasRoute: false, routeOrigin: "none" as const, issue: "none" as const }

  it("says the route is waiting for approval", () => {
    expect(routeScreenPresentation({ ...noRoute, awaitingApproval: true })).toEqual({ banner: null, empty: "awaiting-approval" })
  })

  it("still says «no route» when nothing is waiting", () => {
    expect(routeScreenPresentation({ ...noRoute, awaitingApproval: false })).toEqual({ banner: null, empty: "no-route" })
    expect(routeScreenPresentation(noRoute)).toEqual({ banner: null, empty: "no-route" })
  })

  it("does not claim a route is waiting when the read failed or is still running", () => {
    expect(routeScreenPresentation({ ...noRoute, awaitingApproval: true, issue: "offline" }).empty).toBe("offline-unavailable")
    expect(routeScreenPresentation({ ...noRoute, awaitingApproval: true, issue: "timeout" }).empty).toBe("slow-unavailable")
    expect(routeScreenPresentation({ ...noRoute, awaitingApproval: true, loading: true }).empty).toBe("loading")
  })

  it("shows the route itself once there is one", () => {
    expect(routeScreenPresentation({ ...noRoute, hasRoute: true, routeOrigin: "live", awaitingApproval: true }))
      .toEqual({ banner: null, empty: null })
  })
})

describe("route tab: the screen is wired to it", () => {
  it("asks the same read that found no approved route", () => {
    const absent = source.slice(source.indexOf("if (!routeData) {"), source.indexOf("if (routeData.id) {"))
    expect(absent).toContain("setAwaitingApproval(routeAwaitsApproval(response.data.routes, today))")
    // A route that arrived, and a day with no routes at all, both clear it.
    expect((source.match(/setAwaitingApproval\(false\)/g) ?? []).length).toBe(2)
    expect(source).toContain("    issue: loadIssue,\n    awaitingApproval,\n  })")
  })

  it("says so in all three languages and offers to change the route, not to build one", () => {
    const keys = ["awaitingApprovalTitle", "awaitingApprovalBody", "changeDraftRoute"]
    const counts = keys.map((key) => (source.match(new RegExp(`^    ${key}: "[^"]+",$`, "gm")) ?? []).length)
    expect(counts).toEqual([3, 3, 3])
    expect(source).toContain('? copy.awaitingApprovalTitle')
    expect(source).toContain('? copy.awaitingApprovalBody')
    expect(source).toContain('(emptyMode === "awaiting-approval" ? copy.changeDraftRoute : copy.planOwnRoute)')
  })
})
