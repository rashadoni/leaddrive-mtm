import {
  managerAgentTruth,
  normalizeManagerLocations,
  type ManagerTeamAgent,
} from "./manager-location-truth"

export interface ManagerDashboardStats {
  teamTotal: number
  online: number
  currentLocations: number
  gpsAttention: number
  routes: number
  visitedStops: number
  plannedStops: number
  approvals: number
}

function rows(value: unknown, key: string): any[] {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {}
  return Array.isArray(source[key]) ? source[key] as any[] : []
}

function finiteCount(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

/**
 * Build the manager home snapshot from the same four scoped read models used
 * by Team, Planning and Approvals. Nothing is inferred from another employee's
 * location and missing branches remain zero instead of using demo metrics.
 */
export function toManagerDashboardStats(
  teamData: unknown,
  locationData: unknown,
  planningData: unknown,
  approvalsData: unknown,
  nowMs = Date.now(),
): ManagerDashboardStats {
  const team = rows(teamData, "agents") as ManagerTeamAgent[]
  const locations = normalizeManagerLocations(
    locationData && typeof locationData === "object"
      ? (locationData as Record<string, unknown>).locations
      : undefined,
  )
  const truths = team.map((agent) => managerAgentTruth(agent, locations, nowMs))
  const routes = rows(planningData, "routes")
  const approvalsSource = approvalsData && typeof approvalsData === "object"
    ? approvalsData as Record<string, unknown>
    : {}
  const approvalRows = ["hrm", "routeChanges", "customers", "contactChanges"]
    .reduce((total, key) => total + rows(approvalsSource, key).length, 0)

  return {
    teamTotal: team.length,
    online: truths.filter((truth) => truth.isOnline).length,
    currentLocations: truths.filter((truth) => truth.isOnline && truth.gpsFreshness === "FRESH").length,
    gpsAttention: truths.filter((truth) => truth.gpsFreshness === "STALE" || truth.gpsFreshness === "NO_COORDINATES").length,
    routes: routes.length,
    visitedStops: routes.reduce((total, route) => total + finiteCount(route?.visitedPoints), 0),
    plannedStops: routes.reduce((total, route) => total + finiteCount(route?.totalPoints), 0),
    approvals: approvalRows,
  }
}
