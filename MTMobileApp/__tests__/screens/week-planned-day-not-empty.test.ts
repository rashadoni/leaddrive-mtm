import fs from "fs"
import path from "path"

/**
 * B5 device acceptance, 2026-09-13 (Samsung S23 Ultra, build56). The card for
 * 14 September said "Planlaşdırılıb · 2 nöqtə" and, a few rows below,
 * "Bu gün üçün plan yoxdur". The empty state looked only at visits and tasks,
 * so a planned route with no visit yet counted as "nothing planned". In
 * Azerbaijani the sentence also said "today" on the card of any day.
 */
const week = fs.readFileSync(path.resolve(__dirname, "../../src/screens/week/WeekScreen.tsx"), "utf8")
const agenda = week.slice(week.indexOf("function DayAgenda("), week.indexOf("return (", week.indexOf("function DayAgenda(")) + 400)

describe("B5: a planned day is not an empty day", () => {
  it("does not show the empty state when the day has planned stops", () => {
    const guard = agenda.indexOf("if (agendaEmpty && day.plannedStops > 0) return null")
    const empty = agenda.indexOf("if (agendaEmpty) {")
    expect(guard).toBeGreaterThan(-1)
    expect(empty).toBeGreaterThan(guard)
  })

  it("does not call another day 'today' in Azerbaijani", () => {
    const noAgenda = [...week.matchAll(/noAgenda: "([^"]+)"/g)].map((m) => m[1])
    expect(noAgenda).toContain("Bu tarix üçün plan yoxdur")
    expect(noAgenda).not.toContain("Bu gün üçün plan yoxdur")
    // Russian and English already spoke about "this day".
    expect(noAgenda).toContain("На этот день планов нет")
    expect(noAgenda).toContain("Nothing is planned for this day")
  })
})
