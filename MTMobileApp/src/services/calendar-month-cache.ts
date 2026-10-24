import AsyncStorage from "@react-native-async-storage/async-storage"
import { routeFieldStorageKey } from "../runtime/route-field-profile"
import { readOfflineBootstrap, type OfflineBootstrapBinding } from "./bootstrap-offline-cache"
import { monthGridWindow, shiftDateKey, toWeekData, type WeekData } from "./week"

export const CALENDAR_MONTH_CACHE_KEY = routeFieldStorageKey("calendar-month-v1")
const MAX_AGE = 7 * 24 * 60 * 60 * 1000
const MAX_MONTHS = 3
type Entry = { month: string; storedAt: number; weeks: WeekData[] }
type Cache = { version: 1; binding: OfflineBootstrapBinding; months: Entry[] }
let operations: Promise<unknown> = Promise.resolve()
let sequence = 0, lastDecision = 0
let denied = false
export function nextCalendarRead(): number { return ++sequence }
function serial<T>(work: () => Promise<T>): Promise<T> {
  const next = operations.then(work, work)
  operations = next.catch(() => {})
  return next
}
function sameBinding(left: OfflineBootstrapBinding, right: OfflineBootstrapBinding): boolean {
  return ["scope", "server", "deviceId", "sessionId"].every(key =>
    Boolean(left?.[key as keyof OfflineBootstrapBinding])
      && left[key as keyof OfflineBootstrapBinding] === right?.[key as keyof OfflineBootstrapBinding])
}

/** Re-map only the declared calendar fields; tokens/arbitrary API fields never persist. */
function projectWeek(week: WeekData): WeekData {
  return toWeekData({ weekStart: week.weekStart, weekEndExclusive: week.weekEndExclusive, today: week.today,
    summary: { ...week.summary, coverage: { percentage: week.summary.coveragePct } },
    days: week.days.map(day => ({ ...day,
      routes: day.routes.map(route => ({ id: route.id, name: route.name, status: route.status,
        totalPoints: route.plannedStops })),
      visits: { total: day.visitsTotal, completed: day.visitsCompleted,
        items: day.visits.map(v => ({ id: v.id, customer: { name: v.name }, status: v.status, checkInAt: v.checkInAt })) },
      tasks: { total: day.tasksTotal, completed: day.tasksCompleted, items: day.tasks },
    })) })
}

export function isCompleteCalendarMonth(weeks: WeekData[], month: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(month) || !Array.isArray(weeks) || weeks.length !== 6) return false
  const window = monthGridWindow(month)
  return weeks.every((week, index) => week && week.weekStart === window.weekStarts[index]
    && week.weekEndExclusive === shiftDateKey(week.weekStart, 7)
    && week.summary && Object.values(week.summary).every(n => typeof n === "number" && Number.isFinite(n) && n >= 0)
    && Array.isArray(week.days) && week.days.length === 7
    && week.days.every((day, d) => day && day.date === shiftDateKey(week.weekStart, d)
      && Array.isArray(day.routes) && Array.isArray(day.visits) && Array.isArray(day.tasks)))
}

export function clearCalendarMonthCache(current: () => boolean, read: number): Promise<void> {
  return serial(async () => {
    if (!current() || read < lastDecision) return
    lastDecision = read
    // A storage error must not revive the just-denied projection in this
    // process. Only a later successful server read/write can reopen it.
    denied = true
    await AsyncStorage.removeItem(CALENDAR_MONTH_CACHE_KEY)
  })
}

export function rememberCalendarMonth(binding: OfflineBootstrapBinding, month: string, weeks: WeekData[],
  current: () => boolean, read: number): Promise<void> {
  return serial(async () => {
    if (!current() || read < lastDecision || !isCompleteCalendarMonth(weeks, month)) return
    const now = Date.now()
    let months: Entry[] = []
    try {
      const saved = JSON.parse(await AsyncStorage.getItem(CALENDAR_MONTH_CACHE_KEY) ?? "null") as Cache | null
      if (saved?.version === 1 && sameBinding(binding, saved.binding)) months = saved.months
        .filter(entry => entry.month !== month && now >= entry.storedAt && now - entry.storedAt < MAX_AGE
          && isCompleteCalendarMonth(entry.weeks, entry.month))
    } catch { /* A malformed cache cannot prevent a fresh online read. */ }
    if (!current() || read < lastDecision) return
    lastDecision = read
    const entry = { month, storedAt: now, weeks: weeks.map(projectWeek) }
    const cache: Cache = { version: 1, binding: { ...binding }, months: [...months, entry].slice(-MAX_MONTHS) }
    await AsyncStorage.setItem(CALENDAR_MONTH_CACHE_KEY, JSON.stringify(cache))
    denied = false
  })
}

export async function readOfflineCalendarMonth(binding: OfflineBootstrapBinding, month: string,
  current: () => boolean): Promise<WeekData[] | null> {
  const admission = await readOfflineBootstrap(binding, current)
  if (!admission || !current() || denied) return null
  return serial(async () => {
    try {
      const cache = JSON.parse(await AsyncStorage.getItem(CALENDAR_MONTH_CACHE_KEY) ?? "null") as Cache | null
      const now = Date.now()
      if (!current() || denied || now >= admission.validUntil || cache?.version !== 1 || !sameBinding(binding, cache.binding)) return null
      const entry = cache.months.find(saved => saved.month === month)
      if (!entry || !Number.isFinite(entry.storedAt) || now + 5000 < entry.storedAt
        || now - entry.storedAt >= MAX_AGE || !isCompleteCalendarMonth(entry.weeks, month)) return null
      // Re-map persisted objects before they reach a screen. Dates are a fresh
      // server-calendar projection; today's marker is adjusted by the caller.
      return entry.weeks.map(projectWeek)
    } catch { return null }
  })
}
