import fs from "fs"
import path from "path"

const source = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/week/WeekScreen.tsx"),
  "utf8",
)

const phoneBranch = source.slice(
  source.indexOf("<View style={styles.phoneDays}>"),
  source.indexOf("</ScrollView>"),
)

const monthComponent = source.slice(
  source.indexOf("function MonthCalendar("),
  source.indexOf("function DayDetail("),
)

describe("agent month calendar", () => {
  it("loads six weeks for a familiar 42-day month grid", () => {
    expect(source).toContain("monthGridWindow(month)")
    expect(source).toContain("Promise.all(window.weekStarts.map")
    expect(source).toContain("combineCalendarWeeks(weeks, window)")
  })

  it("shows the month first and one selected day below on a phone", () => {
    expect(phoneBranch).toContain("<MonthCalendar")
    expect(phoneBranch).toContain("{selectedDay ? (")
    expect((phoneBranch.match(/<PhoneDay/g) ?? [])).toHaveLength(1)
    expect(phoneBranch.indexOf("<MonthCalendar")).toBeLessThan(phoneBranch.indexOf("<PhoneDay"))
    expect(source).not.toContain("function WeekStripDay(")
  })

  it("makes routes, tasks and visits visible without crowding phone cells", () => {
    expect(monthComponent).toContain("hasRoute")
    expect(monthComponent).toContain("hasTasks")
    expect(monthComponent).toContain("hasVisits")
    expect(monthComponent).toContain("styles.monthDotRoute")
    expect(monthComponent).toContain("styles.monthDotTask")
    expect(monthComponent).toContain("styles.monthDotVisit")
    expect(monthComponent).toContain("styles.monthSignalsTablet")
  })

  it("keeps every date selectable and fully described to a screen reader", () => {
    expect(monthComponent).toContain('accessibilityRole="button"')
    expect(monthComponent).toContain("accessibilityState={{ selected }}")
    expect(monthComponent).toContain("accessibilityLabel={accessibilityLabel}")
    expect(monthComponent).toContain("formatFullDate(day.date, lang)")
  })

  it("keeps month and day detail visible side by side on a tablet", () => {
    const tabletBranch = source.slice(
      source.indexOf("{tablet ? ("),
      source.indexOf(") : (", source.indexOf("{tablet ? (")),
    )
    expect(tabletBranch).toContain("styles.tabletWorkspace")
    expect(tabletBranch).toContain("<MonthCalendar")
    expect(tabletBranch).toContain("<DayDetail")
    expect(source).toContain('monthPane: { width: "55%", minWidth: 430 }')
  })

  it("opens route planning on the selected calendar date", () => {
    expect(source).toContain("initialDate: selectedDate ?? anchor")
    expect(source).toContain("initialHorizon: 1")
  })

  it("keeps the monthly summary compact and after the useful calendar", () => {
    const strip = source.slice(source.indexOf("  summaryStrip: {"), source.indexOf("  summaryStripTablet:"))
    expect(strip).toContain('flexDirection: "row"')
    expect(phoneBranch.indexOf("<MonthCalendar")).toBeLessThan(phoneBranch.lastIndexOf("<WeekSummary"))
  })
})
