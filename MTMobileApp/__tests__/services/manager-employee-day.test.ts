/**
 * The employee's day on the manager's card (owner, 2026-10-17: «при нажатии
 * получал всю информацию — от маршрута до местонахождения на карте»), read
 * from the server's location history. Fictional people and places.
 */
import { formatDistance, shiftDayKey, splitDuration, toEmployeeDay } from "../../src/services/manager-employee-day"

const point = (id: string, recordedAt: string, latitude: number, longitude: number, extra: Record<string, unknown> = {}) =>
  ({ id, recordedAt, latitude, longitude, accuracy: 8, battery: 76, ...extra })

const HISTORY = {
  range: { date: "2026-10-17", timezone: "Asia/Baku" },
  policy: { stopMinimumMinutes: 5 },
  summary: { distanceMeters: 23_400, lastPointAt: "2026-10-17T07:42:00.000Z" },
  trip: { totals: { movingSeconds: 7_500 } },
  points: [
    point("p1", "2026-10-17T05:12:00.000Z", 40.40, 49.85),
    point("p2", "2026-10-17T05:40:00.000Z", 40.41, 49.86),
    // An hour of silence follows: the phone said nothing.
    point("p3", "2026-10-17T07:00:00.000Z", 40.42, 49.87),
    point("p4", "2026-10-17T07:42:00.000Z", 40.43, 49.88, { accuracy: 6, battery: 71 }),
  ],
  matchedTrack: null,
  gaps: [
    { id: "g1", reason: "TELEMETRY_GAP", startedAt: "2026-10-17T05:41:00.000Z", endedAt: "2026-10-17T06:59:00.000Z", durationSeconds: 4_680 },
    { id: "g2", reason: "WORKDAY_PAUSED", startedAt: "2026-10-17T09:05:00.000Z", endedAt: "2026-10-17T09:45:00.000Z", durationSeconds: 2_400 },
  ],
  stops: [
    { id: "s1", startedAt: "2026-10-17T05:40:00.000Z", endedAt: "2026-10-17T05:58:00.000Z", durationSeconds: 1_080, visit: { id: "v1" } },
    { id: "s2", startedAt: "2026-10-17T06:10:00.000Z", endedAt: "2026-10-17T06:35:00.000Z", durationSeconds: 1_500, visit: null },
    { id: "s3", startedAt: "2026-10-17T06:40:00.000Z", endedAt: "2026-10-17T06:42:00.000Z", durationSeconds: 120, visit: null },
  ],
  workday: { status: "STARTED", startedAt: "2026-10-17T05:12:00.000Z", completedAt: null },
  plannedRoutes: [
    {
      id: "r1",
      status: "IN_PROGRESS",
      points: [
        { id: "rp1", status: "VISITED", label: "Fictional Clinic · Dr Aliyeva", plannedTime: "2026-10-17T05:30:00.000Z", customer: { name: "Fictional Clinic", address: "Fictional st. 1", latitude: 40.41, longitude: 49.86 } },
        { id: "rp2", status: "SKIPPED", label: "Fictional Pharmacy 2", plannedTime: null, customer: { name: "Fictional Pharmacy 2", address: null, latitude: 40.415, longitude: 49.865 } },
        { id: "rp3", status: "PENDING", label: "Fictional Med Centre", plannedTime: "2026-10-17T07:30:00.000Z", customer: { name: "Fictional Med Centre", address: null, latitude: 40.44, longitude: 49.89 } },
        { id: "rp4", status: "PENDING", label: "Fictional Hospital", plannedTime: "2026-10-17T08:10:00.000Z", customer: { name: "Fictional Hospital", address: null, latitude: null, longitude: null } },
      ],
    },
    // A draft is nobody's plan yet.
    { id: "r-draft", status: "DRAFT", points: [{ id: "rd1", status: "PENDING", label: "Fictional Draft Stop", customer: { name: "x" } }] },
  ],
  visits: [
    { id: "v1", routePointId: "rp1", checkInAt: "2026-10-17T05:40:00.000Z", checkOutAt: "2026-10-17T05:58:00.000Z", customer: { name: "Fictional Clinic" } },
    { id: "v2", routePointId: null, checkInAt: "2026-10-17T07:05:00.000Z", checkOutAt: "2026-10-17T07:20:00.000Z", customer: { name: "Fictional Kiosk" } },
  ],
}

describe("the employee's day for the manager's card", () => {
  it("lays out today's route point by point: visited with its times, skipped, the next one, the rest", () => {
    const day = toEmployeeDay(HISTORY, true)
    expect(day.stops.map((stop) => [stop.order, stop.label, stop.status])).toEqual([
      [1, "Fictional Clinic · Dr Aliyeva", "VISITED"],
      [2, "Fictional Pharmacy 2", "SKIPPED"],
      [3, "Fictional Med Centre", "NEXT"],
      [4, "Fictional Hospital", "PLANNED"],
    ])
    expect(day.stops[0].visit).toEqual({ checkInAt: "2026-10-17T05:40:00.000Z", checkOutAt: "2026-10-17T05:58:00.000Z", minutes: 18 })
    expect(day.stops[3].position).toBeNull()
    // A visit belonging to no point of the day's routes is not lost.
    expect(day.extraVisits).toEqual([{ id: "v2", label: "Fictional Kiosk", checkInAt: "2026-10-17T07:05:00.000Z", checkOutAt: "2026-10-17T07:20:00.000Z", minutes: 15 }])
    expect(day.summary).toEqual({ planned: 4, visited: 1, distanceMeters: 23_400, movingSeconds: 7_500, lastPointAt: "2026-10-17T07:42:00.000Z" })
  })

  it("calls a past day's unvisited points «not visited», and has no «now» for it", () => {
    const day = toEmployeeDay(HISTORY, false)
    expect(day.stops.map((stop) => stop.status)).toEqual(["VISITED", "SKIPPED", "MISSED", "MISSED"])
    expect(day.current).toBeNull()
  })

  it("puts him where the last fix of today was, with its accuracy and battery", () => {
    expect(toEmployeeDay(HISTORY, true).current).toEqual({ latitude: 40.43, longitude: 49.88, recordedAt: "2026-10-17T07:42:00.000Z", accuracy: 6, battery: 71 })
  })

  it("reads the breaks from the workday, and names what went off plan: GPS silence and a long stop with no visit", () => {
    const day = toEmployeeDay(HISTORY, true)
    expect(day.workday).toEqual({
      status: "STARTED",
      startedAt: "2026-10-17T05:12:00.000Z",
      completedAt: null,
      breaks: [{ startedAt: "2026-10-17T09:05:00.000Z", endedAt: "2026-10-17T09:45:00.000Z" }],
    })
    // The break is not a deviation; a two-minute pause is not a stop.
    expect(day.deviations.map((item) => [item.kind, item.minutes])).toEqual([["NO_GPS", 78], ["STOP_WITHOUT_VISIT", 25]])
  })

  // Owner's phone, 2026-10-18: «Vizitsiz dayanma 00:00–01:11» on an agent
  // asleep at home before his day began.
  it("counts nothing off plan outside work: before the workday, or before the route when there is no workday", () => {
    const night = {
      ...HISTORY,
      workday: null,
      gaps: [{ id: "g0", reason: "TELEMETRY_GAP", startedAt: "2026-10-17T19:00:00.000Z", endedAt: "2026-10-17T20:30:00.000Z", durationSeconds: 5_400 }],
      stops: [
        // At home from midnight; the route starts at 21:12.
        { id: "home", startedAt: "2026-10-17T20:00:00.000Z", endedAt: "2026-10-17T21:13:00.000Z", durationSeconds: 4_380, visit: null },
        { id: "field", startedAt: "2026-10-17T21:20:00.000Z", endedAt: "2026-10-17T21:40:00.000Z", durationSeconds: 1_200, visit: null },
      ],
      plannedRoutes: [{ ...HISTORY.plannedRoutes[0], startedAt: "2026-10-17T21:12:49.000Z", completedAt: null }],
    }
    expect(toEmployeeDay(night, true).deviations).toEqual([
      { id: "stop-field", kind: "STOP_WITHOUT_VISIT", startedAt: "2026-10-17T21:20:00.000Z", endedAt: "2026-10-17T21:40:00.000Z", minutes: 20 },
    ])
    // Neither a workday nor a started route: no day to be off plan from.
    const notStarted = { ...night, plannedRoutes: [{ ...HISTORY.plannedRoutes[0], startedAt: null }] }
    expect(toEmployeeDay(notStarted, true).deviations).toEqual([])
  })

  it("measures a stop that began before the workday from the workday's start", () => {
    const early = {
      ...HISTORY,
      gaps: [],
      stops: [{ id: "early", startedAt: "2026-10-17T04:00:00.000Z", endedAt: "2026-10-17T05:30:00.000Z", durationSeconds: 5_400, visit: null }],
    }
    expect(toEmployeeDay(early, true).deviations).toEqual([
      { id: "stop-early", kind: "STOP_WITHOUT_VISIT", startedAt: "2026-10-17T05:12:00.000Z", endedAt: "2026-10-17T05:30:00.000Z", minutes: 18 },
    ])
  })

  it("draws the line along the roads when the server matched it, else the fixes broken at the silences", () => {
    // Each place also says which fix it belongs to and how he moved there (the replay's step 3).
    const places = (track: Array<Array<{ latitude: number; longitude: number }>>) =>
      track.map((segment) => segment.map(({ latitude, longitude }) => ({ latitude, longitude })))
    expect(places(toEmployeeDay(HISTORY, true).track)).toEqual([
      [{ latitude: 40.40, longitude: 49.85 }, { latitude: 40.41, longitude: 49.86 }],
      [{ latitude: 40.42, longitude: 49.87 }, { latitude: 40.43, longitude: 49.88 }],
    ])
    const matched = toEmployeeDay({ ...HISTORY, matchedTrack: { segments: [[[40.4, 49.85], [40.405, 49.855], [40.41, 49.86]]] } }, true)
    expect(places(matched.track)).toEqual([[{ latitude: 40.4, longitude: 49.85 }, { latitude: 40.405, longitude: 49.855 }, { latitude: 40.41, longitude: 49.86 }]])
    // The street line's ends lie on the first and the second fix.
    expect([matched.track[0][0].fix, matched.track[0][2].fix]).toEqual([0, 1])
  })

  it("survives an empty or broken answer", () => {
    const day = toEmployeeDay(null, true)
    expect(day).toMatchObject({ stops: [], extraVisits: [], track: [], current: null, workday: null, deviations: [] })
    expect(day.summary).toEqual({ planned: 0, visited: 0, distanceMeters: null, movingSeconds: null, lastPointAt: null })
  })

  it("writes kilometres, spans and neighbouring days", () => {
    expect(formatDistance(850, "ru")).toBe("850 m")
    expect(formatDistance(23_400, "en")).toBe("23.4 km")
    expect(formatDistance(null, "ru")).toBeNull()
    expect(splitDuration(7_500)).toEqual({ hours: 2, minutes: 5 })
    expect(splitDuration(null)).toBeNull()
    expect(shiftDayKey("2026-10-01", -1)).toBe("2026-09-30")
    expect(shiftDayKey("2026-12-31", 1)).toBe("2027-01-01")
  })
})
