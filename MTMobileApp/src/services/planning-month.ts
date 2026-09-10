/**
 * The month a self-planning agent picks a date from.
 *
 * Field UX audit 2026-09-05, task B8: the planner moved the date one day per
 * press. Two weeks ahead was fourteen presses, weekends were not marked, and
 * the default landed on whatever today happened to be — in the audit, a
 * Saturday. A grid answers all three at once, but only if the arithmetic is
 * right, so it lives here where a test can reach it without a screen.
 *
 * Every date is a `YYYY-MM-DD` key in the tenant's own day, never a `Date`:
 * the planner compares these keys against the server's, and a value that
 * silently shifts by a timezone is the whole class of bug this product had in
 * A1 and C2.
 */

export type PlanningMonthDay = {
  /** `YYYY-MM-DD`, or null for the blank cells before the 1st. */
  date: string | null
  /** Day of month, 1..31. */
  day: number | null
  /** Saturday or Sunday in ISO terms. */
  weekend: boolean
  /** Before the tenant's today; a route cannot be planned into the past. */
  past: boolean
  /** The tenant's today. */
  today: boolean
}

const MS_PER_DAY = 86_400_000

function parseKey(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function toKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** The month `anchor` belongs to, shifted by `offset` months. */
export function shiftPlanningMonth(anchor: string, offset: number): string {
  const parsed = parseKey(anchor)
  if (!parsed) return anchor
  const year = parsed.getUTCFullYear()
  const month = parsed.getUTCMonth() + offset
  // Day 1 always exists; clamping to it is what keeps 31 March − 1 month from
  // becoming 3 March.
  return toKey(new Date(Date.UTC(year, month, 1)))
}

/**
 * Six weeks of cells, Monday first, with leading blanks so the 1st sits under
 * its own weekday.
 *
 * Monday first because the product's week starts there everywhere else — the
 * calendar screen, the team week and the server's `weekStart` all agree, and a
 * picker that disagreed would be the one place a manager counts wrong.
 */
export function planningMonthGrid(anchor: string, today: string): PlanningMonthDay[] {
  const parsed = parseKey(anchor)
  if (!parsed) return []
  const year = parsed.getUTCFullYear()
  const month = parsed.getUTCMonth()
  const first = new Date(Date.UTC(year, month, 1))
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  // getUTCDay: 0 is Sunday. Monday-first means Sunday needs six blanks, not none.
  const lead = (first.getUTCDay() + 6) % 7
  const todayDate = parseKey(today)
  const cells: PlanningMonthDay[] = []
  for (let i = 0; i < lead; i += 1) {
    cells.push({ date: null, day: null, weekend: false, past: false, today: false })
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(Date.UTC(year, month, day))
    const key = toKey(date)
    const weekday = date.getUTCDay()
    cells.push({
      date: key,
      day,
      weekend: weekday === 0 || weekday === 6,
      past: todayDate ? date.getTime() < todayDate.getTime() : false,
      today: key === today,
    })
  }
  return cells
}

/**
 * The date the planner should open on: today if it is a working day, otherwise
 * the next one that is.
 *
 * The audit found the planner defaulting to Saturday because that was the day
 * the auditor opened it. Nobody plans a route for a day nobody works; the
 * default should cost zero presses in the common case and one glance in the
 * rest. Weekends are the calendar-independent part — a tenant's own closed
 * days are enforced by the server and explained by A2's reason codes, and
 * guessing them here would be a second, quieter source of truth.
 */
export function nextPlanningWorkday(today: string, limit = 7): string {
  const parsed = parseKey(today)
  if (!parsed) return today
  for (let offset = 0; offset <= limit; offset += 1) {
    const candidate = new Date(parsed.getTime() + offset * MS_PER_DAY)
    const weekday = candidate.getUTCDay()
    if (weekday !== 0 && weekday !== 6) return toKey(candidate)
  }
  return today
}
