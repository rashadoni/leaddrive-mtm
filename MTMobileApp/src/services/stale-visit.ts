import { planningTodayKey } from "./manager-planning"

/**
 * The day a still-open visit was started, when that day is over.
 *
 * Owner's phone, 2026-10-17: a visit checked in on 12 October was still open
 * five days later. The route screen called it «Ziyarət davam edir», the agent
 * took today's photo into it and closed it — which closed the 12 October route
 * — and today's visit never reached the server. Asked what such a visit should
 * be, the owner chose: shown with its date and closed, nothing added to it.
 *
 * Days are the company's (bootstrap timezone), the phone's when it has none —
 * the same rule as the route calendar. Returns the day as YYYY-MM-DD, or null
 * for a visit started today or a check-in time that cannot be read.
 */
export function visitOpenSinceEarlierDay(
  checkInAt: string | null | undefined,
  now = new Date(),
  timezone?: string | null,
): string | null {
  if (!checkInAt) return null
  const at = new Date(checkInAt)
  if (Number.isNaN(at.getTime())) return null
  const day = planningTodayKey(at, timezone)
  return day < planningTodayKey(now, timezone) ? day : null
}

/** That day as the agent reads it, at noon so no timezone moves it across midnight. */
export function staleVisitDayDate(day: string): Date {
  return new Date(`${day}T12:00:00`)
}
