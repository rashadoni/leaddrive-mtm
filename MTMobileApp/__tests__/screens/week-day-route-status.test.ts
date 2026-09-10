import fs from "fs"
import path from "path"
import { toWeekData } from "../../src/services/week"

/**
 * Field UX audit 2026-09-05, task B5. The day card said "3 точек" and stopped
 * there: whether that day was planned, running or already finished was not on
 * it, and the card led nowhere. The acceptance names one card: 1 September
 * should read "3 точки · Запланирован" and open.
 *
 * Half of B5 was already right on main — the "nothing planned" line requires
 * four counters to be zero at once, which is stricter than the audit asked.
 * What was missing is the status and the way out of the card.
 */
const source = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/week/WeekScreen.tsx"),
  "utf8",
)

const day = (routes: unknown[]) => ({
  weekStart: "2026-08-31",
  weekEndExclusive: "2026-09-07",
  today: "2026-09-01",
  days: [{ date: "2026-09-01", isToday: true, isWorkingDay: true, routes }],
  summary: {},
})

describe("B5: the day card says what state its route is in", () => {
  it("carries the status when the day has one answer to give", () => {
    const week = toWeekData(day([{ status: "PLANNED", points: [{}, {}, {}] }]))
    expect(week.days[0].routeStatus).toBe("PLANNED")
    expect(week.days[0].plannedStops).toBe(3)
  })

  it("agrees with itself when several routes share a status", () => {
    const week = toWeekData(day([
      { status: "COMPLETED", points: [{}] },
      { status: "COMPLETED", points: [{}] },
    ]))
    expect(week.days[0].routeStatus).toBe("COMPLETED")
  })

  it("says nothing rather than picking a winner when they disagree", () => {
    // Calling a day "Запланирован" while half of it is already done is worse
    // than leaving the chip off.
    const week = toWeekData(day([
      { status: "PLANNED", points: [{}] },
      { status: "COMPLETED", points: [{}] },
    ]))
    expect(week.days[0].routeStatus).toBeUndefined()
  })

  it("says nothing when the server sent no status at all", () => {
    expect(toWeekData(day([{ points: [{}] }])).days[0].routeStatus).toBeUndefined()
    expect(toWeekData(day([])).days[0].routeStatus).toBeUndefined()
  })

  it("renders it through the shared dictionary, never the raw enum", () => {
    // "PLANNED" is an identifier; "Запланирован" is the word A5 already owns.
    expect((source.match(/statusLabel\(\(key\) => t\(key\), "route", day\.routeStatus\)/g) ?? [])).toHaveLength(2)
  })

  it("gives today's card a way into the route", () => {
    expect(source).toContain("day.isToday && day.routeCount > 0")
    expect(source).toContain("{copy.openRoute}")
    expect(source).toContain('tabNavigation.navigate("Route")')
  })

  it("has the button's label in every language", () => {
    const missing = ["Открыть маршрут", "Marşrutu aç", "Open route"].filter((label) => !source.includes(label))
    expect(missing).toEqual([])
  })
})
