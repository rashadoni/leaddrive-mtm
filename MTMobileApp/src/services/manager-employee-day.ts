/**
 * One employee's day as the manager's card shows it (owner, 2026-10-17: «во
 * входе менеджера также нужно, чтоб был список сотрудников, и при нажатии
 * получал всю информацию — от маршрута до местонахождения на карте, всё, что
 * можно знать о сотруднике»; the card was shown as a picture first).
 *
 * The day comes from the server's location history — the same answer the web
 * «История» page reads: the track, the stops, the gaps, the planned routes and
 * the visits. Nothing here guesses: a stop is «done» because the server says
 * the point was visited, a break is a break because the workday recorded one.
 * Where the employee was during a break is never written (owner's rule), so
 * the map simply has no line there.
 */

export type EmployeeDayPoint = {
  latitude: number
  longitude: number
  /** How he was moving here, as the server read the day; absent from an older server. */
  mode?: EmployeeDayMode
  /** The fix of `fixes` this place of the line belongs to — the replay cuts the line by it. */
  fix?: number
}

export type EmployeeDayMode = "DRIVE" | "WALK" | "STAY"

/**
 * A fix of the day for the replay (owner 2026-11-01, the mockup's step 3):
 * when, where, how he was moving and which way, and what lies after it — a
 * break or a lost signal, across which nothing is drawn.
 */
export interface EmployeeDayFix {
  latitude: number
  longitude: number
  at: number
  mode: EmployeeDayMode
  course: number | null
  cut: null | "GAP" | "BREAK"
}

export type EmployeeDayStopStatus = "VISITED" | "SKIPPED" | "NEXT" | "PLANNED" | "MISSED"

export interface EmployeeDayStop {
  id: string
  order: number
  label: string
  address: string | null
  status: EmployeeDayStopStatus
  plannedTime: string | null
  /** The visit recorded at this point, when there is one. */
  visit: { checkInAt: string; checkOutAt: string | null; minutes: number | null } | null
  position: EmployeeDayPoint | null
}

export interface EmployeeDayExtraVisit {
  id: string
  label: string
  checkInAt: string
  checkOutAt: string | null
  minutes: number | null
}

export interface EmployeeDayDeviation {
  id: string
  kind: "NO_GPS" | "STOP_WITHOUT_VISIT"
  startedAt: string
  endedAt: string
  minutes: number
}

export interface EmployeeDay {
  date: string
  timezone: string | null
  /** Where he went, in pieces: a piece ends where the phone fell silent. */
  track: EmployeeDayPoint[][]
  /** The day's fixes in time order, for the replay; empty when the server gave no times. */
  fixes: EmployeeDayFix[]
  stops: EmployeeDayStop[]
  /** Visits that belong to no point of the day's routes. */
  extraVisits: EmployeeDayExtraVisit[]
  current: { latitude: number; longitude: number; recordedAt: string; accuracy: number | null; battery: number | null } | null
  summary: {
    planned: number
    visited: number
    distanceMeters: number | null
    movingSeconds: number | null
    lastPointAt: string | null
  }
  workday: {
    status: string
    startedAt: string
    completedAt: string | null
    breaks: Array<{ startedAt: string; endedAt: string | null }>
  } | null
  deviations: EmployeeDayDeviation[]
}

const num = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
}
const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null)
const list = (value: unknown): any[] => (Array.isArray(value) ? value : [])
const position = (latitude: unknown, longitude: unknown): EmployeeDayPoint | null => {
  const lat = num(latitude)
  const lng = num(longitude)
  return lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180 ? null : { latitude: lat, longitude: lng }
}
const minutesBetween = (from: string | null, to: string | null): number | null => {
  if (!from || !to) return null
  const span = Date.parse(to) - Date.parse(from)
  return Number.isFinite(span) && span >= 0 ? Math.round(span / 60_000) : null
}

/** Two fixes further apart than this are a silence even without a recorded gap (the server's line). */
const TRIP_GAP_MAX_MS = 5 * 60_000

type RecordedGap = { from: number; to: number; reason: unknown }

const gapsOf = (data: any): RecordedGap[] => list(data?.gaps)
  .map((gap) => ({ from: Date.parse(gap?.startedAt), to: Date.parse(gap?.endedAt), reason: gap?.reason }))
  .filter((gap) => Number.isFinite(gap.from))

/** The recorded gap or break lying between two fixes, if any (it starts at the earlier one, or after it). */
const gapBetween = (gaps: RecordedGap[], from: number, to: number) =>
  gaps.find((gap) => gap.from >= from - 1_000 && gap.from < to && (!Number.isFinite(gap.to) || gap.to <= to + 1_000))

/** The day's fixes, each with what the server read of it and what lies after it. */
function fixesOf(data: any): EmployeeDayFix[] {
  const gaps = gapsOf(data)
  const fixes: EmployeeDayFix[] = []
  for (const row of list(data?.points)) {
    const point = position(row?.latitude, row?.longitude)
    const at = Date.parse(row?.recordedAt)
    if (!point || !Number.isFinite(at) || (fixes.length && at <= fixes[fixes.length - 1].at)) continue
    const mode: EmployeeDayMode = row?.mode === "DRIVE" || row?.mode === "WALK" ? row.mode : "STAY"
    const course = num(row?.course)
    fixes.push({ ...point, at, mode, course: mode !== "STAY" && course != null ? course : null, cut: null })
  }
  fixes.forEach((fix, index) => {
    const next = fixes[index + 1]
    if (!next) return
    const gap = gapBetween(gaps, fix.at, next.at)
    if (gap) fix.cut = gap.reason === "WORKDAY_PAUSED" ? "BREAK" : "GAP"
    else if (next.at - fix.at > TRIP_GAP_MAX_MS) fix.cut = "GAP"
  })
  return fixes
}

const metres = (a: EmployeeDayPoint, b: EmployeeDayPoint) => {
  const toRad = Math.PI / 180
  const dLat = (b.latitude - a.latitude) * toRad
  const dLon = (b.longitude - a.longitude) * toRad * Math.cos(((a.latitude + b.latitude) / 2) * toRad)
  return Math.sqrt(dLat * dLat + dLon * dLon) * 6_371_000
}

/**
 * The road-matched track when the server has one whole, else the recorded
 * fixes split at the gaps. Each place carries the fix it belongs to and how
 * he was moving there: the street line has no times of its own, and runs the
 * way the fixes do, so each place is given the nearest fix at or after the
 * one before it (as the web does, `timeRoadTrack`).
 */
function trackOf(data: any, fixes: EmployeeDayFix[]): EmployeeDayPoint[][] {
  const matched = list(data?.matchedTrack?.segments)
    .map((segment) => list(segment).map((point) => (
      Array.isArray(point) ? position(point[0], point[1]) : position(point?.latitude ?? point?.lat, point?.longitude ?? point?.lng)
    )).filter((point): point is EmployeeDayPoint => point !== null))
    .filter((segment) => segment.length > 1)
  if (matched.length) {
    if (!fixes.length) return matched
    let cursor = 0
    return matched.map((segment) => segment.map((place) => {
      let best = cursor
      let bestMetres = Number.POSITIVE_INFINITY
      for (let index = cursor; index < Math.min(fixes.length, cursor + 40); index += 1) {
        const distance = metres(place, fixes[index])
        if (distance < bestMetres) {
          bestMetres = distance
          best = index
        }
      }
      cursor = best
      return { ...place, fix: best, mode: fixes[best].mode }
    }))
  }

  // The line breaks only where the server recorded a gap or a break, as it
  // always has; a quiet phone between two fixes still draws the way he went.
  const gaps = gapsOf(data)
  const segments: EmployeeDayPoint[][] = []
  let current: EmployeeDayPoint[] = []
  fixes.forEach((fix, index) => {
    current.push({ latitude: fix.latitude, longitude: fix.longitude, fix: index, mode: fix.mode })
    const next = fixes[index + 1]
    if (!next || gapBetween(gaps, fix.at, next.at)) {
      segments.push(current)
      current = []
    }
  })
  return segments
}

type WorkWindow = { from: number; to: number }

/**
 * When he was at work: his workday when there is one, else each of the day's
 * routes from its start to its finish (a field agent outside HR attendance
 * has no workday). Before he starts there is nothing to be off plan from: on
 * the owner's phone (2026-10-18) an agent asleep at home showed «Vizitsiz
 * dayanma 00:00–01:11» on a day he had not begun.
 */
function workWindows(data: any): WorkWindow[] {
  const finite = (value: unknown) => {
    const at = typeof value === "string" ? Date.parse(value) : Number.NaN
    return Number.isFinite(at) ? at : null
  }
  const dayStart = finite(data?.workday?.startedAt)
  if (dayStart != null) return [{ from: dayStart, to: finite(data?.workday?.completedAt) ?? Number.POSITIVE_INFINITY }]
  return list(data?.plannedRoutes)
    .filter((route) => route?.status !== "CANCELLED" && route?.status !== "DRAFT")
    .flatMap((route) => {
      const from = finite(route?.startedAt)
      return from == null ? [] : [{ from, to: finite(route?.completedAt) ?? Number.POSITIVE_INFINITY }]
    })
}

/** The longest part of a stretch of time that falls inside work, or null. */
function insideWork(startedAt: unknown, endedAt: unknown, windows: WorkWindow[]): { startedAt: string; endedAt: string; minutes: number } | null {
  const from = typeof startedAt === "string" ? Date.parse(startedAt) : Number.NaN
  const to = typeof endedAt === "string" ? Date.parse(endedAt) : Number.NaN
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null
  let best: WorkWindow | null = null
  for (const window of windows) {
    const start = Math.max(from, window.from)
    const end = Math.min(to, window.to)
    if (end > start && (!best || end - start > best.to - best.from)) best = { from: start, to: end }
  }
  if (!best) return null
  return {
    startedAt: best.from === from ? String(startedAt) : new Date(best.from).toISOString(),
    endedAt: best.to === to ? String(endedAt) : new Date(best.to).toISOString(),
    minutes: Math.round((best.to - best.from) / 60_000),
  }
}

/**
 * @param data the `data` of GET /api/v1/mtm/location-history?agentId&date
 * @param isToday whether the day is the tenant's today: only then is the first
 *   unvisited point «next» and the last fix «where he is now».
 */
export function toEmployeeDay(data: any, isToday: boolean, stopMinimumMinutes = 5): EmployeeDay {
  const fixes = fixesOf(data)
  const visits = list(data?.visits)
  const visitByPoint = new Map<string, any>()
  for (const visit of visits) {
    const pointId = str(visit?.routePointId)
    if (pointId && !visitByPoint.has(pointId)) visitByPoint.set(pointId, visit)
  }

  const plannedPoints = list(data?.plannedRoutes)
    .filter((route) => route?.status !== "CANCELLED" && route?.status !== "DRAFT")
    .flatMap((route) => list(route?.points))
  let nextAssigned = false
  const stops: EmployeeDayStop[] = plannedPoints.map((point, index) => {
    const visit = visitByPoint.get(point?.id)
    const raw = String(point?.status ?? "PENDING")
    let status: EmployeeDayStopStatus
    if (raw === "VISITED" || visit) status = "VISITED"
    else if (raw === "SKIPPED") status = "SKIPPED"
    else if (!isToday) status = "MISSED"
    else if (!nextAssigned) {
      status = "NEXT"
      nextAssigned = true
    } else status = "PLANNED"
    const checkInAt = str(visit?.checkInAt)
    const checkOutAt = str(visit?.checkOutAt)
    return {
      id: String(point?.id ?? `point-${index}`),
      order: index + 1,
      label: str(point?.label) ?? str(point?.customer?.name) ?? "—",
      address: str(point?.customer?.address),
      status,
      plannedTime: str(point?.plannedTime),
      visit: checkInAt ? { checkInAt, checkOutAt, minutes: minutesBetween(checkInAt, checkOutAt) } : null,
      position: position(point?.customer?.latitude, point?.customer?.longitude),
    }
  })

  const plannedIds = new Set(plannedPoints.map((point) => point?.id))
  const extraVisits: EmployeeDayExtraVisit[] = visits
    .filter((visit) => !visit?.routePointId || !plannedIds.has(visit.routePointId))
    .map((visit) => {
      const checkInAt = String(visit?.checkInAt ?? "")
      const checkOutAt = str(visit?.checkOutAt)
      return {
        id: String(visit?.id),
        label: str(visit?.customer?.name) ?? "—",
        checkInAt,
        checkOutAt,
        minutes: minutesBetween(checkInAt, checkOutAt),
      }
    })

  const points = list(data?.points)
  const last = points.at(-1)
  const lastPosition = last ? position(last.latitude, last.longitude) : null
  const current = isToday && lastPosition && str(last?.recordedAt)
    ? { ...lastPosition, recordedAt: String(last.recordedAt), accuracy: num(last.accuracy), battery: num(last.battery) }
    : null

  const gaps = list(data?.gaps)
  const workdayRow = data?.workday
  const workday = workdayRow && str(workdayRow.startedAt)
    ? {
        status: String(workdayRow.status ?? ""),
        startedAt: String(workdayRow.startedAt),
        completedAt: str(workdayRow.completedAt),
        breaks: gaps
          .filter((gap) => gap?.reason === "WORKDAY_PAUSED")
          .map((gap) => ({ startedAt: String(gap.startedAt), endedAt: str(gap.endedAt) })),
      }
    : null

  // Only what happened at work counts as off plan, and only as much of it as
  // fell inside work — a stop that began at home before the route did is
  // measured from the route's start.
  const windows = workWindows(data)
  const deviations: EmployeeDayDeviation[] = [
    ...gaps
      .filter((gap) => gap?.reason === "TELEMETRY_GAP")
      .flatMap((gap) => {
        const part = insideWork(gap.startedAt, gap.endedAt, windows)
        return part && part.minutes >= stopMinimumMinutes ? [{ id: `gap-${gap.id}`, kind: "NO_GPS" as const, ...part }] : []
      }),
    ...list(data?.stops)
      .filter((stop) => !stop?.visit)
      .flatMap((stop) => {
        const part = insideWork(stop.startedAt, stop.endedAt, windows)
        return part && part.minutes >= stopMinimumMinutes ? [{ id: `stop-${stop.id}`, kind: "STOP_WITHOUT_VISIT" as const, ...part }] : []
      }),
  ].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))

  return {
    date: String(data?.range?.date ?? ""),
    timezone: str(data?.range?.timezone),
    track: trackOf(data, fixes),
    fixes,
    stops,
    extraVisits,
    current,
    summary: {
      planned: stops.length,
      visited: stops.filter((stop) => stop.status === "VISITED").length,
      distanceMeters: num(data?.summary?.distanceMeters),
      movingSeconds: num(data?.trip?.totals?.movingSeconds),
      lastPointAt: str(data?.summary?.lastPointAt),
    },
    workday,
    deviations,
  }
}

/** «23,4 км» / «850 м» — the decimal comma follows the language. */
export function formatDistance(meters: number | null, language: string): string | null {
  if (meters == null) return null
  if (meters < 1_000) return `${Math.round(meters)} m`
  const km = Math.round(meters / 100) / 10
  return `${km.toLocaleString(language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`
}

/** Hours and minutes of a span, for «2 ч 05 мин». */
export function splitDuration(seconds: number | null): { hours: number; minutes: number } | null {
  if (seconds == null || seconds < 0) return null
  const total = Math.round(seconds / 60)
  return { hours: Math.floor(total / 60), minutes: total % 60 }
}

/** The day before or after a YYYY-MM-DD key, on the calendar (no timezone). */
export function shiftDayKey(key: string, days: number): string {
  const at = new Date(`${key}T00:00:00.000Z`)
  at.setUTCDate(at.getUTCDate() + days)
  return at.toISOString().slice(0, 10)
}
