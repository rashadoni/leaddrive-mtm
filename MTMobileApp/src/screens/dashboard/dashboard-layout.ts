import { isTabletWidth } from "../../theme/layoutBreakpoints"

export type DashboardWorkspace = "agent" | "manager"
export type DashboardDeviceClass = "phone" | "tabletPortrait" | "tabletLandscape"

export type DashboardWidgetId =
  | "todayRoute"
  | "weekPlan"
  | "tasks"
  | "coverage"
  | "gps"
  | "promotions"
  | "teamPulse"
  | "teamMap"
  | "planFact"
  | "approvals"
  | "exceptions"

export interface DashboardWidgetDefinition {
  id: DashboardWidgetId
  workspace: DashboardWorkspace
  labelKey: string
  captionKey: string
  icon: string
  color: string
  tint: string
}

export const DASHBOARD_WIDGETS: DashboardWidgetDefinition[] = [
  { id: "todayRoute", workspace: "agent", labelKey: "dashboardV2.widgets.todayRoute", captionKey: "dashboardV2.widgets.todayRouteCaption", icon: "navigate", color: "#08705A", tint: "#D9F1E8" },
  { id: "weekPlan", workspace: "agent", labelKey: "dashboardV2.widgets.weekPlan", captionKey: "dashboardV2.widgets.weekPlanCaption", icon: "calendar", color: "#2E73D2", tint: "#DFEBFA" },
  { id: "tasks", workspace: "agent", labelKey: "dashboardV2.widgets.tasks", captionKey: "dashboardV2.widgets.tasksCaption", icon: "checkbox", color: "#8B5A00", tint: "#FAEECF" },
  { id: "coverage", workspace: "agent", labelKey: "dashboardV2.widgets.coverage", captionKey: "dashboardV2.widgets.coverageCaption", icon: "disc", color: "#7155B7", tint: "#ECE6F7" },
  { id: "gps", workspace: "agent", labelKey: "dashboardV2.widgets.gps", captionKey: "dashboardV2.widgets.gpsCaption", icon: "location", color: "#A43B25", tint: "#FDE6DF" },
  { id: "promotions", workspace: "agent", labelKey: "dashboardV2.widgets.promotions", captionKey: "dashboardV2.widgets.promotionsCaption", icon: "megaphone", color: "#B74874", tint: "#F8E3EC" },
  { id: "teamPulse", workspace: "manager", labelKey: "dashboardV2.widgets.teamPulse", captionKey: "dashboardV2.widgets.teamPulseCaption", icon: "people", color: "#08705A", tint: "#D9F1E8" },
  { id: "teamMap", workspace: "manager", labelKey: "dashboardV2.widgets.teamMap", captionKey: "dashboardV2.widgets.teamMapCaption", icon: "map", color: "#2E73D2", tint: "#DFEBFA" },
  { id: "planFact", workspace: "manager", labelKey: "dashboardV2.widgets.planFact", captionKey: "dashboardV2.widgets.planFactCaption", icon: "analytics", color: "#7155B7", tint: "#ECE6F7" },
  { id: "approvals", workspace: "manager", labelKey: "dashboardV2.widgets.approvals", captionKey: "dashboardV2.widgets.approvalsCaption", icon: "shield-checkmark", color: "#8B5A00", tint: "#FAEECF" },
  { id: "exceptions", workspace: "manager", labelKey: "dashboardV2.widgets.exceptions", captionKey: "dashboardV2.widgets.exceptionsCaption", icon: "warning", color: "#C73B3B", tint: "#F8E1E1" },
]

export type ManagerDashboardDestination = "Team" | "Planning" | "Approvals"

/** Every manager card opens the screen that owns the evidence shown on it. */
export function managerWidgetDestination(id: DashboardWidgetId): ManagerDashboardDestination {
  if (id === "planFact") return "Planning"
  if (id === "approvals") return "Approvals"
  return "Team"
}

export function deviceClassFor(width: number, height: number): DashboardDeviceClass {
  if (!isTabletWidth(width)) return "phone"
  return width > height ? "tabletLandscape" : "tabletPortrait"
}

export function layoutStorageKey(
  tenantId: string,
  userId: string,
  workspace: DashboardWorkspace,
  deviceClass: DashboardDeviceClass
) {
  return [tenantId || "unknown-tenant", userId || "unknown-user", workspace, deviceClass].join(":")
}

export function widgetsForWorkspace(workspace: DashboardWorkspace) {
  return DASHBOARD_WIDGETS.filter((widget) => widget.workspace === workspace)
}

export function defaultWidgetIds(workspace: DashboardWorkspace): DashboardWidgetId[] {
  return widgetsForWorkspace(workspace).slice(0, 4).map((widget) => widget.id)
}

export function sanitizeWidgetIds(workspace: DashboardWorkspace, ids: unknown): DashboardWidgetId[] {
  const allowed = new Set(widgetsForWorkspace(workspace).map((widget) => widget.id))
  if (!Array.isArray(ids)) return defaultWidgetIds(workspace)
  const result = ids.filter((id): id is DashboardWidgetId => typeof id === "string" && allowed.has(id as DashboardWidgetId))
  const unique = Array.from(new Set(result)).slice(0, 6)
  return unique.length > 0 ? unique : defaultWidgetIds(workspace)
}

export const DASHBOARD_MIN_CARD_WIDTH = 200

export function dashboardColumns(
  availableWidth: number,
  count: number,
  tablet = isTabletWidth(availableWidth),
  gap = 16
) {
  if (!tablet || count <= 1) return 1
  const desiredColumns = count === 2 ? 2 : count === 4 ? 2 : 3
  const widthCapacity = Math.max(
    1,
    Math.floor((Math.max(0, availableWidth) + gap) / (DASHBOARD_MIN_CARD_WIDTH + gap))
  )
  return Math.min(desiredColumns, widthCapacity)
}

export function moveWidget(ids: DashboardWidgetId[], id: DashboardWidgetId, direction: -1 | 1) {
  const index = ids.indexOf(id)
  const target = index + direction
  if (index < 0 || target < 0 || target >= ids.length) return ids
  const next = [...ids]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}
