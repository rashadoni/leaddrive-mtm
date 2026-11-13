/**
 * «Повторить маршрут» in the field app (Zeytun 2026-11-13: «клиент хочет
 * повторяющийся маршрут: например, он каждую пятницу идёт по какому-то
 * маршруту. Чтоб мог пересоздавать»; owner's mockup approved with «Давай»).
 *
 * The same rule as the CRM's `src/lib/mtm/route-repeat.ts`: the chosen
 * weekday, every week or every other week, after the route's own day and
 * after today, up to a date, at most 26. Each copy is an ordinary route made
 * by the planner's two requests — a draft, then publish when the source was
 * published and the server says this person may publish — so every server
 * rule applies to each date on its own.
 */

export const ROUTE_REPEAT_MAX_ROUTES = 26
const DAY_MS = 86_400_000

export function isoWeekday(dateKey: string): number {
  const day = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay()
  return day === 0 ? 7 : day
}

export function addDays(dateKey: string, days: number): string {
  return new Date(Date.parse(`${dateKey}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
}

export function routeRepeatDates(input: {
  sourceDate: string
  today: string
  weekday: number
  everyWeeks: 1 | 2
  until: string
}): string[] {
  const { sourceDate, today, weekday, everyWeeks, until } = input
  if (![sourceDate, today, until].every(isDateKey) || weekday < 1 || weekday > 7) return []
  const after = sourceDate > today ? sourceDate : today
  let cursor = addDays(sourceDate, (weekday - isoWeekday(sourceDate) + 7) % 7)
  const dates: string[] = []
  while (cursor <= until && dates.length < ROUTE_REPEAT_MAX_ROUTES) {
    if (cursor > after) dates.push(cursor)
    cursor = addDays(cursor, 7 * everyWeeks)
  }
  return dates
}

export interface RouteRepeatSource {
  id: string
  date: string
  name?: string | null
  status?: string
  agentId: string
  points: Array<{ customerId: string; contactId?: string | null; orderIndex: number; plannedTime?: string | null }>
}

/** Reads GET /routes/:id into what a repeat copies; null when it cannot be copied. */
export function toRouteRepeatSource(raw: any): RouteRepeatSource | null {
  const id = typeof raw?.id === "string" ? raw.id : ""
  const date = typeof raw?.date === "string" ? raw.date.slice(0, 10) : ""
  const agentId = typeof raw?.agentId === "string" ? raw.agentId : ""
  const points = (Array.isArray(raw?.points) ? raw.points : [])
    .filter((point: any) => typeof point?.customerId === "string" && !point?.deletedAt)
    .map((point: any) => ({
      customerId: point.customerId as string,
      contactId: typeof point.contactId === "string" ? point.contactId : null,
      orderIndex: Number(point.orderIndex) || 0,
      plannedTime: typeof point.plannedTime === "string" ? point.plannedTime : null,
    }))
  if (!id || !isDateKey(date) || !agentId || points.length === 0) return null
  return { id, date, name: typeof raw?.name === "string" ? raw.name : null, status: typeof raw?.status === "string" ? raw.status : undefined, agentId, points }
}

/** The draft for one date: the same stops in order, each at the same time of day. */
export function routeRepeatDraft(source: RouteRepeatSource, date: string) {
  const shift = Date.parse(`${date}T00:00:00.000Z`) - Date.parse(`${source.date}T00:00:00.000Z`)
  return {
    agentId: source.agentId,
    date,
    name: source.name || null,
    points: [...source.points]
      .sort((left, right) => left.orderIndex - right.orderIndex)
      .map((point) => ({
        customerId: point.customerId,
        ...(point.contactId ? { contactId: point.contactId } : {}),
        plannedTime: point.plannedTime ? new Date(Date.parse(point.plannedTime) + shift).toISOString() : null,
      })),
  }
}

export type RouteRepeatReason = "busy" | "closedDay" | "stopsInvalid" | "conflict" | "duplicate" | "failed"
export type RouteRepeatOutcome =
  | { date: string; result: "created"; routeId: string; published: boolean }
  | { date: string; result: "skipped"; reason: RouteRepeatReason }

export function routeRepeatRefusal(code: unknown): RouteRepeatReason {
  switch (code) {
    case "MTM_ROUTE_NON_WORKING_DAY": return "closedDay"
    case "MTM_ROUTE_REFERENCE_INVALID":
    case "MTM_ROUTE_TARGET_ASSIGNMENT_REQUIRED": return "stopsInvalid"
    case "ROUTE_CONFLICT":
    case "ROUTE_POINT_TIME_CONFLICT": return "conflict"
    case "ROUTE_DUPLICATE": return "duplicate"
    default: return "failed"
  }
}

/** One date at a time; a busy date is skipped without asking, a refused one with its reason. */
export async function runRouteRepeat(input: {
  source: RouteRepeatSource
  dates: string[]
  busyDates: ReadonlySet<string>
  publish: boolean
  create: (draft: ReturnType<typeof routeRepeatDraft>) => Promise<any>
  publishRoute: (id: string, expectedVersion: number) => Promise<any>
}): Promise<RouteRepeatOutcome[]> {
  const outcomes: RouteRepeatOutcome[] = []
  for (const date of input.dates) {
    if (input.busyDates.has(date)) {
      outcomes.push({ date, result: "skipped", reason: "busy" })
      continue
    }
    let created: any
    try {
      created = await input.create(routeRepeatDraft(input.source, date))
    } catch (error: any) {
      outcomes.push({ date, result: "skipped", reason: routeRepeatRefusal(error?.code) })
      continue
    }
    const routeId = created?.data?.id
    if (typeof routeId !== "string") {
      outcomes.push({ date, result: "skipped", reason: "failed" })
      continue
    }
    let published = false
    if (input.publish && typeof created?.data?.version === "number") {
      published = await input.publishRoute(routeId, created.data.version).then(() => true, () => false)
    }
    outcomes.push({ date, result: "created", routeId, published })
  }
  return outcomes
}

/** The days in [first, last] the agent already has a route on (a cancelled one does not hold the day). */
export function busyRouteDates(raw: any): Set<string> {
  const routes = Array.isArray(raw?.data?.routes) ? raw.data.routes : []
  return new Set(routes
    .filter((route: any) => route?.status !== "CANCELLED" && typeof route?.date === "string")
    .map((route: any) => String(route.date).slice(0, 10)))
}
