import fs from "fs"
import path from "path"

/**
 * Field UX audit 2026-09-05, task B6, and the device acceptance of B5 that
 * measured it: on a 1080×2316 phone the calendar rendered seven full day cards
 * of 754 px each — a week with nothing planned cost about 5300 px of scrolling
 * to establish that there was nothing to do. Every card was expanded, so the
 * selected day looked exactly like the other six, and the list opened on
 * Monday while today was Wednesday.
 *
 * The tablet already had the right shape: a list of days and one open day. The
 * fix is the phone getting the same idea in its own proportions — a strip of
 * seven, one card below it.
 */
const source = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/week/WeekScreen.tsx"),
  "utf8",
)

const phoneBranch = source.slice(
  source.indexOf("<View style={styles.phoneDays}>"),
  source.indexOf("</ScrollView>"),
)

describe("B6: the week fits one screen", () => {
  it("draws seven days as a strip, not seven cards", () => {
    expect(phoneBranch).toContain("styles.weekStrip")
    expect(phoneBranch).toContain("<WeekStripDay")
    expect(source).toContain("function WeekStripDay(")
  })

  it("opens exactly one day, the selected one", () => {
    // The old branch mapped every day to a PhoneDay; a card per day is what
    // made six of the seven noise.
    expect(phoneBranch).not.toContain("data.days.map((day) => (\n                <PhoneDay")
    expect(phoneBranch).toContain("{selectedDay ? (")
    expect((phoneBranch.match(/<PhoneDay/g) ?? [])).toHaveLength(1)
  })

  it("marks a day that has something on it without printing a table", () => {
    const tile = source.slice(source.indexOf("function WeekStripDay("), source.indexOf("function PhoneDay("))
    expect(tile).toContain("day.plannedStops > 0 || day.visitsTotal > 0 || day.tasksTotal > 0")
    expect(tile).toContain("styles.stripDotPlanned")
    // Seven counts across 1080 px is a table nobody reads.
    expect(tile).not.toContain("visitsCompleted")
    expect(tile).not.toContain("tasksCompleted")
  })

  it("names the day for a screen reader, since the tile shows only a number", () => {
    const tile = source.slice(source.indexOf("function WeekStripDay("), source.indexOf("function PhoneDay("))
    expect(tile).toContain("accessibilityLabel={label}")
    expect(tile).toContain("formatFullDate(day.date, lang)")
    expect(tile).toContain("accessibilityState={{ selected }}")
  })

  it("selects today rather than hunting for its card", () => {
    // returnToToday used to measure where the card sat and scroll there. With
    // one card on screen there is nothing to scroll to, and the two refs that
    // existed only to hold those offsets are gone.
    expect(source).toContain("setSelectedDate(data.today)")
    expect(source).not.toContain("phoneDayY")
    expect(source).not.toContain("phoneListY")
  })

  it("keeps the week summary on one line", () => {
    // Three stacked 62 px rows stood between the header and the first day.
    const strip = source.slice(source.indexOf("  summaryStrip: {"), source.indexOf("  summaryStripTablet:"))
    expect(strip).toContain('flexDirection: "row"')
    expect(strip).not.toContain('flexDirection: "column"')
  })

  it("leaves the tablet's master-detail alone", () => {
    // The phone borrowed the tablet's idea; it must not have taken its layout.
    expect(source).toContain("styles.tabletWorkspace")
    expect(source).toContain("<DaySelector")
    expect(source).toContain("<DayDetail")
  })
})
