import { toManagerDashboardStats } from "../../src/services/manager-dashboard"

describe("toManagerDashboardStats", () => {
  const now = Date.parse("2026-08-20T12:00:00.000Z")

  it("uses scoped server evidence for team, location, planning and approvals", () => {
    expect(toManagerDashboardStats(
      {
        agents: [
          { id: "a1", name: "A", role: "AGENT", isOnline: true, lastSeenAt: "2026-08-20T11:58:00.000Z", workday: null },
          { id: "a2", name: "B", role: "AGENT", isOnline: false, lastSeenAt: "2026-08-20T09:00:00.000Z", workday: null },
        ],
      },
      {
        locations: [
          { id: "a1", isOnline: true, lastSeenAt: "2026-08-20T11:58:00.000Z", location: { latitude: 40.4, longitude: 49.8, recordedAt: "2026-08-20T11:58:00.000Z" } },
        ],
      },
      { routes: [{ visitedPoints: 2, totalPoints: 5 }, { visitedPoints: 3, totalPoints: 3 }] },
      { hrm: [{}], routeChanges: [{}, {}], customers: [], contactChanges: [{}] },
      now,
    )).toEqual({
      teamTotal: 2,
      online: 1,
      currentLocations: 1,
      gpsAttention: 1,
      routes: 2,
      visitedStops: 5,
      plannedStops: 8,
      approvals: 4,
    })
  })

  it("does not manufacture values when a response branch is missing", () => {
    expect(toManagerDashboardStats({}, {}, {}, {}, now)).toEqual({
      teamTotal: 0,
      online: 0,
      currentLocations: 0,
      gpsAttention: 0,
      routes: 0,
      visitedStops: 0,
      plannedStops: 0,
      approvals: 0,
    })
  })
})
