import type { CachedRoute } from "../../services/offline-reads"

const ACTIVE_ROUTE_STATUSES = new Set(["PLANNED", "IN_PROGRESS"])

export interface TodayRoutePoint {
  id: string
  orderIndex: number
  status: string
  plannedTime?: string
  customer?: {
    id?: string
    name?: string
    address?: string
  }
}

export interface TodayRouteSummary {
  id: string
  name?: string
  date: string
  status: string
  totalPoints: number
  visitedPoints: number
  remainingPoints: number
  nextPoint: TodayRoutePoint | null
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function string(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function normalizePoint(value: unknown): TodayRoutePoint | null {
  const source = object(value)
  const id = string(source?.id)
  if (!source || !id) return null

  const customerSource = object(source.customer)
  const customer = customerSource
    ? {
        id: string(customerSource.id),
        name: string(customerSource.name),
        address: string(customerSource.address),
      }
    : undefined

  return {
    id,
    orderIndex: finiteNumber(source.orderIndex) ?? 0,
    status: string(source.status) ?? "",
    plannedTime: string(source.plannedTime),
    customer,
  }
}

function routeDateKey(value: unknown): string | null {
  const date = string(value)
  if (!date) return null
  const match = date.match(/^(\d{4}-\d{2}-\d{2})/)
  return match?.[1] ?? null
}

export function localDateKey(now: Date = new Date()): string {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-")
}

/**
 * Select only an active route for the requested local day. The API may return
 * more than one row, so an in-progress route takes precedence over a merely
 * planned one. Past, future, completed, and malformed records are ignored.
 */
export function selectTodayRoute(
  routes: unknown,
  today: string = localDateKey(),
): TodayRouteSummary | null {
  if (!Array.isArray(routes)) return null

  const candidates = routes
    .map((value) => object(value))
    .filter((value): value is Record<string, unknown> => Boolean(value))
    .filter((route) => routeDateKey(route.date) === today)
    .filter((route) => ACTIVE_ROUTE_STATUSES.has(string(route.status) ?? ""))
    .sort((left, right) => {
      const leftRank = string(left.status) === "IN_PROGRESS" ? 0 : 1
      const rightRank = string(right.status) === "IN_PROGRESS" ? 0 : 1
      return leftRank - rightRank
    })

  const source = candidates[0]
  const id = string(source?.id)
  const date = routeDateKey(source?.date)
  if (!source || !id || !date) return null

  const points = Array.isArray(source.points)
    ? source.points
        .map(normalizePoint)
        .filter((point): point is TodayRoutePoint => Boolean(point))
        .sort((left, right) => left.orderIndex - right.orderIndex)
    : []
  const visitedFromPoints = points.filter((point) => point.status === "VISITED").length
  const totalPoints = Math.max(0, finiteNumber(source.totalPoints) ?? 0, points.length)
  const visitedPoints = Math.min(
    totalPoints,
    Math.max(0, points.length > 0 ? visitedFromPoints : finiteNumber(source.visitedPoints) ?? 0),
  )

  return {
    id,
    name: string(source.name),
    date,
    status: string(source.status) ?? "PLANNED",
    totalPoints,
    visitedPoints,
    remainingPoints: Math.max(totalPoints - visitedPoints, 0),
    nextPoint: points.find((point) => point.status !== "VISITED") ?? null,
  }
}

export function cachedRouteAsTodaySummary(
  route: CachedRoute | null,
  today: string = localDateKey(),
): TodayRouteSummary | null {
  return route ? selectTodayRoute([route], today) : null
}
