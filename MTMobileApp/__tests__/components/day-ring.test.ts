import fs from "fs"
import path from "path"
import { dayRingClock, dayRingMinutes, dayRingParts, readDayTime } from "../../src/components/day-ring"
import { mobileResources } from "../../src/i18n/mobile-resources"

/**
 * The «ring of the day» (owner, 2026-11-02, variant «C. Кольцо дня»): with
 * clients, on the way, on a break — on the manager's «Komanda» card and the
 * agent's own green card of the day.
 */
const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8")
const day = { startedAt: "2026-11-02T05:10:00.000Z", totalMinutes: 228, visitMinutes: 112, breakMinutes: 25, travelMinutes: 91 }

describe("the ring of the day", () => {
  it("goes round clients, then the way, then the break, and closes", () => {
    const parts = dayRingParts(day)
    expect(parts.map((part) => part.key)).toEqual(["visits", "travel", "break"])
    expect(parts[parts.length - 1].end).toBeCloseTo(1, 6)
    expect(parts[0].end).toBeCloseTo(112 / 228, 6)
    expect(parts[1].end).toBeCloseTo(203 / 228, 6)
  })

  it("leaves out what took no time, and draws nothing for a day of no minutes", () => {
    expect(dayRingParts({ ...day, breakMinutes: 0 }).map((part) => part.key)).toEqual(["visits", "travel"])
    expect(dayRingParts({ ...day, totalMinutes: 0, visitMinutes: 0, breakMinutes: 0, travelMinutes: 0 })).toEqual([])
  })

  it("says the day's length as a clock in the middle and minutes beside it", () => {
    expect(dayRingClock(228)).toBe("3:48")
    expect(dayRingClock(7)).toBe("0:07")
    const t = (key: string, values?: Record<string, unknown>) =>
      key === "dayRing.hoursMinutes" ? `${values?.hours} ч ${values?.minutes} мин` : `${values?.minutes} мин`
    expect(dayRingMinutes(112, t)).toBe("1 ч 52 мин")
    expect(dayRingMinutes(25, t)).toBe("25 мин")
  })

  it("draws no ring from a malformed answer or an older server", () => {
    expect(readDayTime(undefined)).toBeNull()
    expect(readDayTime({ ...day, visitMinutes: -1 })).toBeNull()
    expect(readDayTime({ ...day, startedAt: 5 })).toBeNull()
    expect(readDayTime(day)).toEqual(day)
  })

  it("stands on the manager's card and on the agent's card while his day is on", () => {
    const team = read("src/screens/manager/ManagerWorkspaceScreen.android.tsx")
    expect(team).toContain("const dayTime = readDayTime(agent.dayTime)")
    expect(team).toContain("<DayRing day={dayTime} t={t}")
    const today = read("src/screens/today/TodayScreen.tsx")
    expect(today).toContain("{workdayOpen && dayTime ? (")
    expect(today).toContain('<DayRing tone="dark" day={dayTime}')
    const ring = read("src/components/DayRing.tsx")
    expect(ring).toContain("AccessibilityInfo.isReduceMotionEnabled()")
    expect(ring).toContain("useNativeDriver: true")
  })

  it("names every part in all three languages", () => {
    for (const locale of ["ru", "az", "en"] as const) {
      expect(Object.keys(mobileResources[locale].dayRing).sort()).toEqual(["break", "hoursMinutes", "minutes", "since", "travel", "visits"])
    }
  })
})
