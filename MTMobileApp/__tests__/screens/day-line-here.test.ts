import fs from "fs"
import path from "path"
import { DAY_STRIP_MOVEMENT_ICON, dayStripHereIndex, dayStripStops } from "../../src/components/day-line"

/**
 * The day line with a marker where the agent is now (owner, 2026-11-01, from
 * a delivery app's tracking line: «так же для менеджеров и агентов в дневном
 * машруте можно было бы сделать очень красиво визуально»). The manager sees
 * how each agent moves — car, on foot, standing — the agent sees «you are
 * here» on his own day.
 */
const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8")

describe("the marker on the day line", () => {
  it("stands after the stops behind him and before the next one", () => {
    expect(dayStripHereIndex(dayStripStops(3, 8))).toBe(3)
    expect(dayStripHereIndex(dayStripStops(0, 4))).toBe(0)
    expect(dayStripHereIndex(dayStripStops(7, 8))).toBe(7)
  })

  it("is gone once the plan is done, and with no plan", () => {
    expect(dayStripHereIndex(dayStripStops(5, 5))).toBeNull()
    expect(dayStripHereIndex(dayStripStops(0, 0))).toBeNull()
  })

  it("has a picture for each way the server reads a live point", () => {
    expect(DAY_STRIP_MOVEMENT_ICON).toEqual({ DRIVE: "car", WALK: "walk", STAY: "stop" })
  })

  it("is drawn on the strip in the colour it is given, between the stops", () => {
    const strip = read("src/components/DayLine.tsx")
    expect(strip).toContain("const at = here ? dayStripHereIndex(stops) : null")
    expect(strip).toContain('<View testID="day-strip-here" style={[styles.here, { backgroundColor: here.color }]}>')
  })

  it("shows the manager how an agent moves only from a live point of a day under way", () => {
    const team = read("src/screens/manager/ManagerWorkspaceScreen.android.tsx")
    expect(team).toContain('const moving = currentPosition && agent.workday?.status === "STARTED" ? location?.movement?.mode ?? null : null')
    expect(team).toContain("here={moving ? { icon: DAY_STRIP_MOVEMENT_ICON[moving], color: MOVEMENT_COLORS[moving] } : null}")
    // In words too, beside the count, for whoever does not read the picture.
    expect(team).toContain("t(`managerShell.movement${moving}`)")
  })

  it("shows the agent where he is on «Bu gün» only while his day is under way and something is left", () => {
    const today = read("src/screens/today/TodayScreen.tsx")
    expect(today).toContain("{workdayActive && route.totalPoints > 0 && route.remainingPoints > 0 ? (")
    expect(today).toContain('here={{ icon: "navigate", color: fieldTheme.color.primary }}')
    // The vertical line with every client stays under it.
    expect(today.indexOf('testID="today-route-strip"')).toBeLessThan(today.indexOf("<DayLineRail"))
  })
})
