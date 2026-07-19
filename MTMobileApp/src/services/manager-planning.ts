/**
 * Pure mapper for the Manager planning workspace (GET /mobile/manager/planning).
 * The day's routes across the manager's scope, flattened for the list UI.
 */

export interface PlanningRoute {
  id: string
  name: string
  agentName: string
  status: string
  visited: number
  total: number
}

function str(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  const s = String(value)
  return s.length > 0 ? s : undefined
}

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

export function toPlanningRoutes(raw: any): PlanningRoute[] {
  const routes = Array.isArray(raw?.routes) ? (raw.routes as any[]) : []
  return routes.map((r) => ({
    id: String(r?.id ?? ""),
    name: str(r?.name) ?? "",
    agentName: str(r?.agent?.name) ?? "",
    status: str(r?.status) ?? "",
    visited: num(r?.visitedPoints),
    total: num(r?.totalPoints),
  }))
}
