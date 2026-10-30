import { isTransportFailure } from "./bootstrap"
import type { OfflineBootstrapBinding } from "./bootstrap-offline-cache"
import { clearCalendarMonthCache, isCompleteCalendarMonth, nextCalendarRead, readOfflineCalendarMonth, rememberCalendarMonth } from "./calendar-month-cache"
import { combineCalendarWeeks, monthGridWindow, toWeekData, type WeekData } from "./week"

type Response = { success?: boolean; data?: unknown }
type Result = { data: WeekData | null; stale: boolean }

/** Six successful weeks replace the month atomically. A denial never falls back. */
export async function loadCalendarMonth({ month, binding, current, getWeek, today }: {
  month: string; binding: OfflineBootstrapBinding | null; current: () => boolean;
  getWeek: (start: string) => Promise<Response>; today: string;
}): Promise<Result | null> {
  const read = nextCalendarRead(), window = monthGridWindow(month)
  // Wait for all six results: an early transport failure must not hide a 403
  // arriving from another week of the same month.
  const responses = await Promise.allSettled(window.weekStarts.map(getWeek))
  if (!current()) return null
  const denied = responses.some(response => response.status === "rejected"
    ? !isTransportFailure(response.reason)
    : !response.value?.success || !response.value.data)
  if (denied) {
    await clearCalendarMonthCache(current, read).catch(() => {})
    return current() ? { data: null, stale: true } : null
  }
  if (responses.every(response => response.status === "fulfilled")) {
    const weeks = responses.map(response => toWeekData((response as PromiseFulfilledResult<Response>).value.data))
    if (!isCompleteCalendarMonth(weeks, month)) {
      await clearCalendarMonthCache(current, read).catch(() => {})
      return current() ? { data: null, stale: true } : null
    }
    if (binding) await rememberCalendarMonth(binding, month, weeks, current, read).catch(() => {})
    return current() ? { data: combineCalendarWeeks(weeks, window), stale: false } : null
  }
  const weeks = binding ? await readOfflineCalendarMonth(binding, month, current).catch(() => null) : null
  if (!current()) return null
  const data = weeks ? combineCalendarWeeks(weeks, window) : null
  if (data) {
    data.today = today
    data.days = data.days.map(day => ({ ...day, isToday: day.date === today }))
  }
  return { data, stale: true }
}
