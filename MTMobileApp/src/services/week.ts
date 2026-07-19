/**
 * Pure mappers for the Agent week/agenda screen (SWM-17), kept outside the
 * component so the day flattening and the week-navigation date math are
 * unit-tested. Backed by the server GET /mobile/week seven-day contract.
 */

export interface WeekVisitItem {
  id: string
  name: string
  status: string
  checkInAt?: string
}

export interface WeekDay {
  date: string
  isToday: boolean
  isWeekend: boolean
  isWorkingDay: boolean
  nonWorkingReason?: string
  routeCount: number
  plannedStops: number
  tasksTotal: number
  tasksCompleted: number
  visitsTotal: number
  visitsCompleted: number
  visits: WeekVisitItem[]
}

export interface WeekSummary {
  visits: number
  visitsCompleted: number
  tasks: number
  tasksCompleted: number
  plannedStops: number
  visitedStops: number
  coveragePct: number
}

export interface WeekData {
  weekStart: string
  weekEndExclusive: string
  today: string
  days: WeekDay[]
  summary: WeekSummary
}

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function optStr(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  const s = String(value)
  return s.length > 0 ? s : undefined
}

function mapDay(raw: any): WeekDay {
  const routes = Array.isArray(raw?.routes) ? raw.routes : []
  const plannedStops = routes.reduce(
    (sum: number, route: any) => sum + (Array.isArray(route?.points) ? route.points.length : 0),
    0,
  )
  const visitItems = Array.isArray(raw?.visits?.items) ? raw.visits.items : []
  return {
    date: String(raw?.date ?? ""),
    isToday: Boolean(raw?.isToday),
    isWeekend: Boolean(raw?.isWeekend),
    isWorkingDay: raw?.isWorkingDay !== false,
    nonWorkingReason: raw?.nonWorkingReason ? String(raw.nonWorkingReason) : undefined,
    routeCount: routes.length,
    plannedStops,
    tasksTotal: num(raw?.tasks?.total),
    tasksCompleted: num(raw?.tasks?.completed),
    visitsTotal: num(raw?.visits?.total),
    visitsCompleted: num(raw?.visits?.completed),
    visits: visitItems.map((v: any) => ({
      id: String(v?.id ?? ""),
      name: optStr(v?.customer?.name) ?? optStr(v?.contact?.displayName) ?? "",
      status: optStr(v?.status) ?? "",
      checkInAt: optStr(v?.checkInAt),
    })),
  }
}

export function toWeekData(raw: any): WeekData {
  const days = Array.isArray(raw?.days) ? raw.days.map(mapDay) : []
  const s = raw?.summary ?? {}
  return {
    weekStart: String(raw?.weekStart ?? ""),
    weekEndExclusive: String(raw?.weekEndExclusive ?? ""),
    today: String(raw?.today ?? ""),
    days,
    summary: {
      visits: num(s.visits),
      visitsCompleted: num(s.visitsCompleted),
      tasks: num(s.tasks),
      tasksCompleted: num(s.tasksCompleted),
      plannedStops: num(s.plannedStops),
      visitedStops: num(s.visitedStops),
      coveragePct: num(s.coverage?.percentage),
    },
  }
}

/**
 * Shift a YYYY-MM-DD date key by whole days in UTC (used by the week
 * navigation ‹ / › controls). Returns the input unchanged if it isn't a valid
 * date key, so a bad server value can't crash navigation.
 */
export function shiftDateKey(dateKey: string, deltaDays: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!match) return dateKey
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  if (Number.isNaN(d.getTime())) return dateKey
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return d.toISOString().slice(0, 10)
}
