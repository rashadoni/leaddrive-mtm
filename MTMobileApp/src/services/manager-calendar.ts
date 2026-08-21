import { shiftPlanningDateKey } from "./manager-planning"

export type ManagerCalendarMode = "month" | "week"

export interface ManagerCalendarAgent {
  id: string
  name: string
}

export interface ManagerCalendarRoute {
  id: string
  agentId: string
  agentName: string
  date: string
  name: string
  status: string
  visited: number
  total: number
}

export interface ManagerCalendarData {
  from: string
  to: string
  agents: ManagerCalendarAgent[]
  routes: ManagerCalendarRoute[]
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value)
}

function count(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function dateKey(value: unknown): string {
  return /^(\d{4}-\d{2}-\d{2})/.exec(text(value))?.[1] ?? ""
}

export function toManagerCalendarData(raw: any, fallback: { from: string; to: string }): ManagerCalendarData {
  const source = raw?.data ?? raw ?? {}
  const rawAgents: unknown[] = Array.isArray(source.agents) ? source.agents : []
  const rawRoutes: unknown[] = Array.isArray(source.routes) ? source.routes : []
  const agents = rawAgents.flatMap((value: any) => {
    const id = text(value?.id)
    if (!id) return []
    return [{ id, name: text(value?.name) || id }]
  })
  const agentNames = new Map(agents.map((agent) => [agent.id, agent.name]))
  const routes = rawRoutes.flatMap((value: any) => {
    const id = text(value?.id)
    const agentId = text(value?.agentId ?? value?.agent?.id)
    const date = dateKey(value?.date)
    if (!id || !agentId || !date) return []
    return [{
      id,
      agentId,
      agentName: text(value?.agent?.name) || agentNames.get(agentId) || agentId,
      date,
      name: text(value?.name),
      status: text(value?.status) || "UNKNOWN",
      visited: count(value?.visitedPoints),
      total: count(value?.totalPoints),
    }]
  })

  // Older servers did not return an agent roster. Keep their routes usable
  // without inventing employees who have no server record in this response.
  routes.forEach((route) => {
    if (!agentNames.has(route.agentId)) {
      agentNames.set(route.agentId, route.agentName)
      agents.push({ id: route.agentId, name: route.agentName })
    }
  })

  return {
    from: dateKey(source.from ?? source.date) || fallback.from,
    to: dateKey(source.to ?? source.date) || fallback.to,
    agents: agents.sort((left, right) => left.name.localeCompare(right.name)),
    routes: routes.sort((left, right) => left.date.localeCompare(right.date) || left.agentName.localeCompare(right.agentName)),
  }
}

export function managerWeekWindow(anchor: string): { from: string; to: string } {
  const parsed = new Date(`${anchor}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) return { from: anchor, to: shiftPlanningDateKey(anchor, 6) }
  const mondayOffset = (parsed.getUTCDay() + 6) % 7
  const from = shiftPlanningDateKey(anchor, -mondayOffset)
  return { from, to: shiftPlanningDateKey(from, 6) }
}

export function managerMonthWindow(anchor: string): { from: string; to: string } {
  const parsed = new Date(`${anchor}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) return managerWeekWindow(anchor)
  const firstOfMonth = `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}-01`
  const firstWeek = managerWeekWindow(firstOfMonth)
  const lastOfMonth = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
  return { from: firstWeek.from, to: managerWeekWindow(lastOfMonth).to }
}

export function managerCalendarWindow(anchor: string, mode: ManagerCalendarMode): { from: string; to: string } {
  return mode === "week" ? managerWeekWindow(anchor) : managerMonthWindow(anchor)
}

export function calendarDateKeys(from: string, to: string): string[] {
  const values: string[] = []
  let cursor = from
  for (let index = 0; index < 42 && cursor <= to; index += 1) {
    values.push(cursor)
    cursor = shiftPlanningDateKey(cursor, 1)
  }
  return values
}

export function shiftManagerCalendarAnchor(anchor: string, mode: ManagerCalendarMode, direction: -1 | 1): string {
  if (mode === "week") return shiftPlanningDateKey(anchor, direction * 7)
  const parsed = new Date(`${anchor}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) return anchor
  parsed.setUTCDate(1)
  parsed.setUTCMonth(parsed.getUTCMonth() + direction)
  return parsed.toISOString().slice(0, 10)
}

export function managerCalendarRouteTone(status: string): "draft" | "active" | "done" | "cancelled" | "planned" {
  switch (status.toUpperCase()) {
    case "DRAFT": return "draft"
    case "IN_PROGRESS": return "active"
    case "COMPLETED": return "done"
    case "CANCELLED": return "cancelled"
    default: return "planned"
  }
}
