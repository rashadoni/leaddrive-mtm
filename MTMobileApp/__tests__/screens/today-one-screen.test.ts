import fs from "fs"
import path from "path"
import { mobileResources } from "../../src/i18n/mobile-resources"

/**
 * Field UX audit 2026-09-05, task B7. "Сегодня" was three screens of scrolling
 * before it said anything: the day's state, then a next-step card padded to
 * 310 dp, then counters that repeat the calendar's week summary, then a grid of
 * four buttons that repeat the tab bar two centimetres below them.
 *
 * The acceptance that matters is on a phone and belongs to epic D. What a test
 * can hold is that the duplicates do not come back — every one of them was
 * added by someone who could not see the tab bar and the calendar at the same
 * time as this file.
 */
const source = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/today/TodayScreen.tsx"),
  "utf8",
)

describe("B7: Today fits one screen", () => {
  it("does not repeat the tab bar as a grid of shortcuts", () => {
    // Route, Calendar, Tasks and Visits are the four tabs. A card that opens
    // a tab is a second way to press it, not a second thing to do.
    expect(source).not.toContain("QUICK_ACTIONS")
    expect(source).not.toContain("quickGrid")
    for (const key of ["quickTitle", "quickRoute", "quickCalendar", "quickTasks", "quickVisits"]) {
      expect(source).not.toContain(`todayV2.${key}`)
    }
  })

  it("does not repeat the calendar's week summary as today's counters", () => {
    // WeekScreen already shows visits and tasks as completed/total. Two places
    // showing the same pair is one place too many, and this was the one that
    // showed two zeros before the day started.
    expect(source).not.toContain("ProgressRow")
    expect(source).not.toContain("progressSection")
    expect(source).not.toContain("todayV2.visitsProgress")
    expect(source).not.toContain("todayV2.tasksProgress")
  })

  it("keeps the overdue count, which is the one figure the week summary lacks", () => {
    // Deleting the counters wholesale would have taken this with them: with a
    // route on the screen the next-step card never mentions overdue tasks, so
    // the agent would learn about them by missing them.
    expect(source).toContain("stats.tasks.overdue > 0")
    expect(source).toContain("todayV2.overdueTasks")
    expect(source).toContain('onPress={() => open("Tasks")}')
  })

  it("lets the next-step card be as tall as its own words", () => {
    // minHeight held the fold open on an empty day; the card said four lines
    // and reserved room for twelve.
    const panel = source.slice(source.indexOf("  nextPanel: {"), source.indexOf("  nextPanelRoute: {"))
    expect(panel).not.toContain("minHeight")
  })

  it("still answers the two questions the screen exists for", () => {
    // Whatever else goes, the day's state and the single next action stay, in
    // that order: the workday panel is written before the next panel.
    expect(source.indexOf("styles.workdayPanel")).toBeGreaterThan(-1)
    expect(source.indexOf("styles.workdayPanel")).toBeLessThan(source.indexOf("styles.nextPanel,"))
  })

  it.each(["ru", "en", "az"] as const)("leaves no orphaned %s strings behind", (locale) => {
    const block = mobileResources[locale].todayV2 as Record<string, unknown>
    const orphans = [
      "quickTitle", "quickBody", "quickRoute", "quickCalendar", "quickTasks", "quickVisits",
      "progressTitle", "progressBody", "visitsProgress", "tasksProgress",
      "loadingProgress", "progressUnavailable", "partial",
    ].filter((key) => key in block)
    expect(orphans).toEqual([])
    // The line that survived has to survive in every language.
    expect(block.overdueTasks).toBeTruthy()
  })
})
