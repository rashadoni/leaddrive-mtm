jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"))
jest.mock("../../src/services/bootstrap-offline-cache", () => ({ readOfflineBootstrap: jest.fn() }))

import AsyncStorage from "@react-native-async-storage/async-storage"
import { readOfflineBootstrap } from "../../src/services/bootstrap-offline-cache"
import { loadCalendarMonth } from "../../src/services/calendar-month"
import { CALENDAR_MONTH_CACHE_KEY, clearCalendarMonthCache, nextCalendarRead,
  readOfflineCalendarMonth, rememberCalendarMonth } from "../../src/services/calendar-month-cache"
import { monthGridWindow, shiftDateKey, toWeekData } from "../../src/services/week"

const NOW = Date.parse("2026-10-24T12:00:00Z"), WEEK = 604800000, MONTH = "2026-10-01"
const binding = { scope: "tenant:agent", server: "https://tenant.example", deviceId: "phone", sessionId: "login" }
const admission = readOfflineBootstrap as jest.Mock
const current = () => true
const offline = jest.fn(async (_start: string): Promise<any> => { throw new TypeError("Network request failed") })
function response(start: string) {
  return { success: true, data: { weekStart: start, weekEndExclusive: shiftDateKey(start, 7), today: "2026-10-24",
    token: "never-persist", summary: { visits: 1, tasks: 1, plannedStops: 2 },
    days: Array.from({ length: 7 }, (_, day) => ({ date: shiftDateKey(start, day), isToday: false,
      routes: [{ id: `route-${start}`, name: "Route A", status: "PLANNED", points: [{ id: "a" }, { id: "b" }] }],
      tasks: { total: 1, completed: 0, items: [{ id: "task-a", title: "Bring samples", status: "PENDING", priority: "HIGH" }] },
      visits: { total: 1, completed: 0, items: [{ id: "visit-a", status: "CHECKED_IN", customer: { name: "Pharmacy A" } }] },
    })) } }
}
const live = async (start: string) => response(start)
function load(getWeek = live, month = MONTH, bound = binding, active = current) {
  return loadCalendarMonth({ month, binding: bound, current: active, getWeek, today: "2026-10-25" })
}

beforeEach(async () => {
  jest.useFakeTimers(); jest.setSystemTime(NOW); jest.clearAllMocks(); await AsyncStorage.clear()
  admission.mockResolvedValue({ validUntil: NOW + WEEK })
})
afterEach(() => jest.useRealTimers())

it("restores all six weeks and their route/task/visit content after a cold offline load", async () => {
  const online = await load()
  const cached = await load(offline)
  expect(cached?.stale).toBe(true)
  expect(cached?.data?.days).toHaveLength(42)
  expect(cached?.data?.days[0].routes).toEqual(online?.data?.days[0].routes)
  expect(cached?.data?.days[0].plannedStops).toBe(2)
  expect(cached?.data?.days[0].tasks).toEqual(online?.data?.days[0].tasks)
  expect(cached?.data?.days[0].visits).toEqual(online?.data?.days[0].visits)
  expect(cached?.data?.summary).toEqual(online?.data?.summary)
  expect(cached?.data?.days.filter(d => d.isToday).map(d => d.date)).toEqual(["2026-10-25"])
  expect(await AsyncStorage.getItem(CALENDAR_MONTH_CACHE_KEY)).not.toContain("never-persist")
})
it.each(["scope", "server", "deviceId", "sessionId"] as const)("isolates the saved month by %s", async key => {
  await load()
  expect((await load(offline, MONTH, { ...binding, [key]: "other" }))?.data).toBeNull()
})
it("never reuses October as an empty or stale November", async () => {
  await load()
  expect((await load(offline, "2026-11-01"))?.data).toBeNull()
})
it("requires the current offline grant, including after logout or a bootstrap denial", async () => {
  await load(); admission.mockResolvedValue(null)
  expect((await load(offline))?.data).toBeNull()
})
it.each([WEEK, -5001])("refuses expired or reversed-clock cache at %s", async delta => {
  await load(); admission.mockResolvedValue({ validUntil: NOW + 2 * WEEK }); jest.setSystemTime(NOW + delta)
  expect((await load(offline))?.data).toBeNull()
})
it("rechecks the grant deadline after storage read", async () => {
  await load()
  admission.mockImplementation(async () => { jest.setSystemTime(NOW + 10); return { validUntil: NOW + 5 } })
  expect((await load(offline))?.data).toBeNull()
})
it.each([401, 403, 404])("a %s clears old data and cannot silently fall back", async status => {
  await load()
  const denied = async (_start: string): Promise<any> => { throw Object.assign(new Error("denied"), { status }) }
  expect((await load(denied))?.data).toBeNull()
  expect(await AsyncStorage.getItem(CALENDAR_MONTH_CACHE_KEY)).toBeNull()
  expect((await load(offline))?.data).toBeNull()
})
it("a late 403 wins over an earlier transport failure in another week", async () => {
  await load()
  const denied = async (start: string): Promise<any> => {
    if (start === monthGridWindow(MONTH).weekStarts[0]) return offline(start)
    await Promise.resolve()
    throw Object.assign(new Error("denied"), { status: 403 })
  }
  expect((await load(denied))?.data).toBeNull()
  expect(await AsyncStorage.getItem(CALENDAR_MONTH_CACHE_KEY)).toBeNull()
})
it("an unsuccessful API envelope clears data even with HTTP 200", async () => {
  await load(); await load(async () => ({ success: false, data: null }) as any)
  expect((await load(offline))?.data).toBeNull()
})
it("partial success cannot overwrite a previously complete month", async () => {
  await load()
  const partial = async (start: string): Promise<any> => {
    if (start === monthGridWindow(MONTH).weekStarts[0]) return offline(start)
    const fresh = response(start); fresh.data.days[0].tasks.items[0].title = "Changed"; return fresh
  }
  expect((await load(partial))?.data?.days[7].tasks[0].title).toBe("Bring samples")
})
it("a malformed successful response is an error, not an empty month", async () => {
  await load()
  const broken = async (start: string) => {
    const res = response(start); res.data.days.pop(); return res
  }
  expect(await load(broken)).toEqual({ data: null, stale: true })
  expect((await load(offline))?.data).toBeNull()
})
it("stores at most three recently loaded months", async () => {
  for (const month of ["2026-08-01", "2026-09-01", "2026-10-01", "2026-11-01"]) await load(live, month)
  expect((await load(offline, "2026-08-01"))?.data).toBeNull()
  expect((await load(offline, "2026-09-01"))?.data?.days).toHaveLength(42)
})
it("does not revive a newer denial with a late old success", async () => {
  const old = nextCalendarRead(), denied = nextCalendarRead()
  await clearCalendarMonthCache(current, denied)
  await rememberCalendarMonth(binding, MONTH, monthGridWindow(MONTH).weekStarts.map(s => toWeekData(response(s).data)), current, old)
  expect(await readOfflineCalendarMonth(binding, MONTH, current)).toBeNull()
})
it("ignores an answer after navigation, logout, or session switch", async () => {
  let active = true
  const getWeek = async (start: string) => { active = false; return response(start) }
  expect(await load(getWeek, MONTH, binding, () => active)).toBeNull()
  expect(await AsyncStorage.getItem(CALENDAR_MONTH_CACHE_KEY)).toBeNull()
})
it.each(["{", JSON.stringify({ version: 1, binding, months: [{ month: MONTH, storedAt: NOW, weeks: [null] }] })])(
  "handles corrupt storage without showing an invented empty calendar", async raw => {
    await AsyncStorage.setItem(CALENDAR_MONTH_CACHE_KEY, raw)
    expect((await load(offline))?.data).toBeNull()
  })
it("storage failure cannot hide a successful online month", async () => {
  const write = jest.spyOn(AsyncStorage, "setItem").mockRejectedValueOnce(new Error("disk full"))
  expect((await load())?.data?.days).toHaveLength(42)
  write.mockRestore()
})
