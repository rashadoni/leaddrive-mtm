import {
  dashboardColumns,
  deviceClassFor,
  layoutStorageKey,
  moveWidget,
  sanitizeWidgetIds,
} from "../../src/screens/dashboard/dashboard-layout"

describe("dashboard layout", () => {
  it("uses the accepted 1–6 responsive grid rules", () => {
    expect(deviceClassFor(390, 844)).toBe("phone")
    expect(deviceClassFor(1280, 800)).toBe("tabletLandscape")
    expect(dashboardColumns(390, 6)).toBe(1)
    expect(dashboardColumns(1280, 1)).toBe(1)
    expect(dashboardColumns(1280, 2)).toBe(2)
    expect(dashboardColumns(1280, 3)).toBe(3)
    expect(dashboardColumns(1280, 4)).toBe(2)
    expect(dashboardColumns(1280, 6)).toBe(3)
  })

  it("isolates persisted layouts by tenant, user, workspace and device", () => {
    expect(layoutStorageKey("tenant-a", "user-a", "agent", "phone"))
      .not.toBe(layoutStorageKey("tenant-b", "user-a", "agent", "phone"))
    expect(layoutStorageKey("tenant-a", "user-a", "agent", "phone"))
      .not.toBe(layoutStorageKey("tenant-a", "user-a", "manager", "phone"))
  })

  it("rejects foreign, duplicate and excessive widget ids", () => {
    expect(sanitizeWidgetIds("agent", ["todayRoute", "todayRoute", "teamMap", "tasks"]))
      .toEqual(["todayRoute", "tasks"])
    expect(sanitizeWidgetIds("manager", [
      "teamPulse",
      "teamMap",
      "planFact",
      "approvals",
      "teamCoverage",
      "exceptions",
      "todayRoute",
    ])).toHaveLength(6)
  })

  it("reorders without mutating the source", () => {
    const current = sanitizeWidgetIds("agent", ["todayRoute", "weekPlan", "tasks"])
    expect(moveWidget(current, "weekPlan", 1)).toEqual(["todayRoute", "tasks", "weekPlan"])
    expect(current).toEqual(["todayRoute", "weekPlan", "tasks"])
  })
})
