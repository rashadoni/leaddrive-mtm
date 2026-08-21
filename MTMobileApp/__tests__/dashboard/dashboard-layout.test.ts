import {
  dashboardColumns,
  deviceClassFor,
  layoutStorageKey,
  managerWidgetDestination,
  moveWidget,
  sanitizeWidgetIds,
  widgetsForWorkspace,
} from "../../src/screens/dashboard/dashboard-layout"
import {
  LAYOUT_BREAKPOINTS,
  LAYOUT_TOUCH_TARGETS,
  isExpandedTabletWidth,
  isTabletWidth,
} from "../../src/theme/layoutBreakpoints"

describe("dashboard layout", () => {
  it("uses shared tablet breakpoints at their exact boundaries", () => {
    expect(LAYOUT_BREAKPOINTS).toEqual({ tablet: 600, expandedTablet: 840 })
    expect(isTabletWidth(599)).toBe(false)
    expect(isTabletWidth(600)).toBe(true)
    expect(isExpandedTabletWidth(839)).toBe(false)
    expect(isExpandedTabletWidth(840)).toBe(true)
    expect(LAYOUT_TOUCH_TARGETS.expandedTablet).toBeGreaterThanOrEqual(48)
  })

  it("switches dashboard layout at 599/600 while preserving 839/840 tablet layout", () => {
    expect(deviceClassFor(599, 900)).toBe("phone")
    expect(deviceClassFor(600, 900)).toBe("tabletPortrait")
    expect(deviceClassFor(839, 600)).toBe("tabletLandscape")
    expect(deviceClassFor(840, 600)).toBe("tabletLandscape")
    expect(dashboardColumns(599, 2)).toBe(1)
    expect(dashboardColumns(600, 2)).toBe(2)
  })

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

  it("caps compact-tablet columns by the measured content width after the rail", () => {
    expect(dashboardColumns(456, 2, true)).toBe(2)
    expect(dashboardColumns(456, 3, true)).toBe(2)
    expect(dashboardColumns(456, 6, true)).toBe(2)
    expect(dashboardColumns(680, 6, true)).toBe(3)
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
    ])).toEqual(["teamPulse", "teamMap", "planFact", "approvals", "exceptions"])
  })

  it("offers only manager widgets backed by the four manager read models", () => {
    expect(widgetsForWorkspace("manager").map((widget) => widget.id)).toEqual([
      "teamPulse",
      "teamMap",
      "planFact",
      "approvals",
      "exceptions",
    ])
  })

  it("opens every manager metric at the screen that owns its evidence", () => {
    expect(managerWidgetDestination("teamPulse")).toBe("Team")
    expect(managerWidgetDestination("teamMap")).toBe("Team")
    expect(managerWidgetDestination("exceptions")).toBe("Team")
    expect(managerWidgetDestination("planFact")).toBe("Planning")
    expect(managerWidgetDestination("approvals")).toBe("Approvals")
  })

  it("reorders without mutating the source", () => {
    const current = sanitizeWidgetIds("agent", ["todayRoute", "weekPlan", "tasks"])
    expect(moveWidget(current, "weekPlan", 1)).toEqual(["todayRoute", "tasks", "weekPlan"])
    expect(current).toEqual(["todayRoute", "weekPlan", "tasks"])
  })
})
