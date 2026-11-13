/**
 * Pure mappers for the Agent week/agenda screen (SWM-17), kept outside the
 * component so the day flattening and the week-navigation date math are
 * unit-tested. Backed by the server GET /mobile/week seven-day contract.
 */

import type { RawTask } from "./task-detail"

export interface WeekVisitItem {
  id: string
  name: string
  status: string
  checkInAt?: string
  /** The route stop this visit was made at; absent for a visit off the route. */
  routePointId?: string
}

/**
 * A task returned inside `/mobile/week`. The endpoint intentionally sends the
 * same core fields consumed by TaskDetail, so tapping an agenda row can open a
 * useful offline-first detail immediately without another network request.
 */
export interface WeekTaskItem extends RawTask {
  status: string
  priority: string
}

/**
 * One stop of a day's route, as the calendar shows it (Zeytun 2026-11-13:
 * «при выборе даты маршруты в будущие дни не видны — виден только которые
 * исполнились»). The server always sent the stops; the app kept only their
 * count, so a day without visits yet showed nobody to go to.
 */
export interface WeekRouteStop {
  id: string
  /** The doctor on a doctor stop, otherwise the pharmacy/clinic. */
  name: string
  /** Where the doctor works; absent on an organization stop. */
  place?: string
  /** Server effective status: PENDING | VISITED | MISSED. */
  status: string
  plannedTime?: string
}

export interface WeekRouteSummary {
  id: string
  name?: string
  status?: string
  plannedStops: number
  stops: WeekRouteStop[]
  /** The reader is this route's primary agent: «Повторить маршрут» is his to use. */
  own: boolean
}

export interface WeekDay {
  date: string
  isToday: boolean
  isWeekend: boolean
  isWorkingDay: boolean
  nonWorkingReason?: string
  /** Server calendar day kind (WEEKEND, PUBLIC_HOLIDAY, …); labelled via status.dayKind. */
  calendarKind?: string
  routeCount: number
  /** Compact route rows shown directly inside the Outlook-style month cell. */
  routes: WeekRouteSummary[]
  /**
   * The day's route status, when the day has one answer to give (audit B5).
   * Several routes with different statuses have no single honest label, so
   * the field stays absent rather than picking a winner and calling a day
   * "Запланирован" while half of it is already done.
   */
  routeStatus?: string
  plannedStops: number
  tasksTotal: number
  tasksCompleted: number
  visitsTotal: number
  visitsCompleted: number
  visits: WeekVisitItem[]
  tasks: WeekTaskItem[]
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

export interface MonthGridWindow {
  monthStart: string
  monthEndExclusive: string
  gridStart: string
  gridEndExclusive: string
  weekStarts: string[]
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

function mapStop(raw: any): WeekRouteStop {
  const doctor = optStr(raw?.contact?.displayName)
  const organization = optStr(raw?.customer?.name)
  return {
    id: String(raw?.id ?? ""),
    name: doctor ?? organization ?? "",
    place: doctor ? organization : undefined,
    status: optStr(raw?.effectiveStatus) ?? optStr(raw?.status) ?? "PENDING",
    plannedTime: optStr(raw?.plannedTime),
  }
}

function mapDay(raw: any): WeekDay {
  const routes = Array.isArray(raw?.routes) ? raw.routes : []
  const plannedStops = routes.reduce(
    (sum: number, route: any) => sum + (Array.isArray(route?.points) ? route.points.length : num(route?.totalPoints)),
    0,
  )
  const routeStatuses = routes
    .map((route: any) => optStr(route?.status))
    .filter((status: string | undefined): status is string => Boolean(status))
  const routeStatus = routeStatuses.length > 0 && routeStatuses.every((status: string) => status === routeStatuses[0])
    ? routeStatuses[0]
    : undefined
  const visitItems = Array.isArray(raw?.visits?.items) ? raw.visits.items : []
  const taskItems = Array.isArray(raw?.tasks?.items) ? raw.tasks.items : []
  return {
    date: String(raw?.date ?? ""),
    isToday: Boolean(raw?.isToday),
    isWeekend: Boolean(raw?.isWeekend),
    isWorkingDay: raw?.isWorkingDay !== false,
    nonWorkingReason: raw?.nonWorkingReason ? String(raw.nonWorkingReason) : undefined,
    calendarKind: raw?.calendarKind ? String(raw.calendarKind) : undefined,
    routeCount: routes.length,
    routes: routes.map((route: any) => ({
      id: String(route?.id ?? ""),
      name: optStr(route?.name),
      status: optStr(route?.effectiveStatus) ?? optStr(route?.status),
      plannedStops: Array.isArray(route?.points) ? route.points.length : num(route?.totalPoints),
      stops: Array.isArray(route?.points) ? route.points.map(mapStop) : [],
      own: route?.assignmentRole === "PRIMARY",
    })),
    routeStatus,
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
      routePointId: optStr(v?.routePointId),
    })),
    tasks: taskItems.map((task: any) => ({
      id: String(task?.id ?? ""),
      title: optStr(task?.title) ?? "",
      description: optStr(task?.description),
      status: optStr(task?.status) ?? "PENDING",
      priority: optStr(task?.priority) ?? "MEDIUM",
      dueDate: optStr(task?.dueDate),
      completedAt: optStr(task?.completedAt),
      customer: task?.customer
        ? { name: optStr(task.customer.name) }
        : null,
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

export interface DayStopRow {
  key: string
  stop: WeekRouteStop
  /** The visit made at this stop, when there is one: the row opens it. */
  visit?: WeekVisitItem
}

/**
 * The chosen day as the agent reads it: every stop of the day's routes in
 * route order, each with the visit made there, and the visits made off the
 * route. A visit made at a stop is shown once — on its stop.
 */
export function dayRouteAgenda(day: WeekDay): { stops: DayStopRow[]; offRouteVisits: WeekVisitItem[] } {
  const visitsByPoint = new Map<string, WeekVisitItem>()
  for (const visit of day.visits) {
    if (visit.routePointId && !visitsByPoint.has(visit.routePointId)) visitsByPoint.set(visit.routePointId, visit)
  }
  const used = new Set<string>()
  const stops = day.routes.flatMap((route) => (route.stops ?? []).map((stop, index) => {
    const visit = stop.id ? visitsByPoint.get(stop.id) : undefined
    if (visit) used.add(visit.id)
    return { key: `${route.id}:${stop.id || index}`, stop, ...(visit ? { visit } : {}) }
  }))
  return { stops, offRouteVisits: day.visits.filter((visit) => !used.has(visit.id)) }
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

/** The Monday-first week (seven date keys) a date belongs to. */
export function weekOfDate(dateKey: string): string[] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!match) return []
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  const monday = shiftDateKey(dateKey, -((day.getUTCDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, index) => shiftDateKey(monday, index))
}

function calendarDateKey(year: number, monthIndex: number, day: number): string {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10)
}

/** Six Monday-first rows, matching the familiar Outlook-style month grid. */
export function monthGridWindow(anchor: string): MonthGridWindow {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(anchor)
  const fallback = new Date()
  const year = match ? Number(match[1]) : fallback.getUTCFullYear()
  const monthIndex = match ? Number(match[2]) - 1 : fallback.getUTCMonth()
  const monthStart = calendarDateKey(year, monthIndex, 1)
  const monthEndExclusive = calendarDateKey(year, monthIndex + 1, 1)
  const first = new Date(`${monthStart}T00:00:00.000Z`)
  const mondayOffset = (first.getUTCDay() + 6) % 7
  const gridStart = shiftDateKey(monthStart, -mondayOffset)
  const weekStarts = Array.from({ length: 6 }, (_, index) => shiftDateKey(gridStart, index * 7))
  return {
    monthStart,
    monthEndExclusive,
    gridStart,
    gridEndExclusive: shiftDateKey(gridStart, 42),
    weekStarts,
  }
}

export function shiftMonthKey(anchor: string, deltaMonths: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(anchor)
  if (!match) return anchor
  return calendarDateKey(Number(match[1]), Number(match[2]) - 1 + deltaMonths, 1)
}

/** Merge the six non-overlapping week responses used by the month screen. */
export function combineCalendarWeeks(weeks: WeekData[], window: MonthGridWindow): WeekData {
  const days = new Map<string, WeekDay>()
  for (const week of weeks) {
    for (const day of week.days) days.set(day.date, day)
  }
  const summary = weeks.reduce<WeekSummary>((result, week) => ({
    visits: result.visits + week.summary.visits,
    visitsCompleted: result.visitsCompleted + week.summary.visitsCompleted,
    tasks: result.tasks + week.summary.tasks,
    tasksCompleted: result.tasksCompleted + week.summary.tasksCompleted,
    plannedStops: result.plannedStops + week.summary.plannedStops,
    visitedStops: result.visitedStops + week.summary.visitedStops,
    coveragePct: 0,
  }), {
    visits: 0,
    visitsCompleted: 0,
    tasks: 0,
    tasksCompleted: 0,
    plannedStops: 0,
    visitedStops: 0,
    coveragePct: 0,
  })
  summary.coveragePct = summary.plannedStops > 0
    ? (summary.visitedStops / summary.plannedStops) * 100
    : 0
  return {
    weekStart: window.gridStart,
    weekEndExclusive: window.gridEndExclusive,
    today: weeks.find((week) => week.today)?.today ?? "",
    days: Array.from(days.values())
      .filter((day) => day.date >= window.gridStart && day.date < window.gridEndExclusive)
      .sort((left, right) => left.date.localeCompare(right.date)),
    summary,
  }
}
