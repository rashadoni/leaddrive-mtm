/**
 * Pure mapping for the personal KPI contract (GET /mobile/kpi). Kept outside
 * the store so the shape mapping is unit-tested without a network or zustand.
 *
 * Why this exists: the dashboard used to derive its own numbers by counting
 * /visits, /tasks and /photos client-side. Those list endpoints carry no date
 * filter, so a widget captioned "today" was really showing the first page of
 * all-time rows. The server owns the formulas (plan fulfilment, coverage, GPS
 * confirmation) and now exposes a day period, so the app reads them instead of
 * inventing its own — a widget and the web report cannot disagree.
 *
 * Period naming differs by design: the UI has always said "today", the server
 * contract says "day". `serverPeriod` is the single place that translates.
 */

/** Period as the dashboard names it. */
export type KpiPeriod = "today" | "week" | "month"

/** Period as /mobile/kpi names it. */
export type ServerKpiPeriod = "day" | "week" | "month"

export interface KpiRatio {
  numerator: number
  denominator: number
  percentage: number
}

export interface KpiStats {
  /** Route progress: completed planned stops out of planned stops. */
  visits: { completed: number; total: number }
  /** Visits closed outside the plan — real work the plan ratio cannot show. */
  unplannedCompleted: number
  /** Stops left behind on a day that is already over. */
  missed: number
  tasks: { done: number; total: number; overdue: number }
  coverage: KpiRatio | null
  gps: { visitConfirmation: KpiRatio | null; points: number }
  /**
   * Photo evidence is not part of the KPI contract, so it is unknown rather
   * than zero. Rendering 0 would read as "no photos taken", which is a
   * different claim from "the server does not measure this".
   */
  photos: { count: number | null }
  period: KpiPeriod
  /** False when the server truncated its fact window; numbers are partial. */
  authoritative: boolean
}

export function serverPeriod(period: KpiPeriod): ServerKpiPeriod {
  return period === "today" ? "day" : period
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function ratio(value: unknown): KpiRatio | null {
  const source = record(value)
  if (!source) return null
  return {
    numerator: count(source.numerator),
    denominator: count(source.denominator),
    percentage: count(source.percentage),
  }
}

/**
 * Map a /mobile/kpi payload into the dashboard shape. Tolerates missing
 * branches: a partial payload degrades to zeros and nulls rather than throwing
 * and blanking the whole dashboard.
 */
export function toKpiStats(payload: unknown, period: KpiPeriod): KpiStats {
  const data = record(record(payload)?.data) ?? {}
  const visits = record(data.visits) ?? {}
  const tasks = record(data.tasks) ?? {}
  const coverage = record(data.coverage) ?? {}
  const gps = record(data.gps) ?? {}
  const formula = record(data.formula) ?? {}

  return {
    visits: {
      completed: count(visits.completedPlanned),
      total: count(visits.planned),
    },
    unplannedCompleted: count(visits.unplannedCompleted),
    missed: count(visits.missed),
    tasks: {
      done: count(tasks.completed),
      total: count(tasks.assigned),
      overdue: count(tasks.overdue),
    },
    coverage: ratio(coverage.overall),
    gps: {
      visitConfirmation: ratio(gps.visitConfirmation),
      points: count(gps.points),
    },
    photos: { count: null },
    period,
    // Absent `authoritative` means an older server that never truncated.
    authoritative: formula.authoritative !== false,
  }
}
