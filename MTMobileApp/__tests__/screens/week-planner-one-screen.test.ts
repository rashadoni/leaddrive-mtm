import fs from "fs"
import path from "path"
import { mobileResources } from "../../src/i18n/mobile-resources"

/**
 * Week planner redesign agreed with the owner on 2026-09-14 ("каша, глаза
 * разбегаются"): one plan screen instead of fill + review, seven day tiles
 * without sideways scrolling, a customer tap adds to the selected day,
 * "copy to other days", with routes planned by date and stop order only.
 */
const core = fs.readFileSync(path.resolve(__dirname, "../../src/screens/planning/PlanningWorkspaceCore.android.tsx"), "utf8")

describe("week planner on one screen", () => {
  it("has two steps, and the second one saves", () => {
    expect(core).toContain("type PlanningStep = 1 | 2")
    expect(core).not.toContain("setStep(3)")
    expect(core).not.toContain('managerShell.planRailWeekAssign')
    const footerStart = core.indexOf("const footerAction = selfPlanning")
    const footer = core.slice(footerStart, core.indexOf("return (", footerStart))
    expect(footer).toContain("onPress: confirmAndSave")
  })

  it("does not repeat the explanation on the plan screen", () => {
    expect(core).toContain('<SectionIntro number="2" title={t("managerShell.planStepTargets")} />')
    expect(core).toContain("step === 1 && hintsHydrated && hintsEnabled")
  })

  it("shows all seven days as tiles, with no sideways scroll", () => {
    const chooser = core.slice(core.indexOf("function WeekDayChooser("), core.indexOf("function DayPlanEditor("))
    expect(chooser).not.toContain("<ScrollView")
    expect(chooser).toContain("weekdayShort(date, language)")
    const snapshot = core.slice(core.indexOf("function WeekSnapshot("), core.indexOf("function StatusPill("))
    expect(snapshot).not.toContain("<ScrollView")
  })

  it("marks the whole chosen week in the month grid and names weekdays", () => {
    expect(core).toContain("inWindow && styles.monthDayInWindow")
    expect(core).not.toContain('weekday: "narrow"')
  })

  it("copies a day only after the server confirms each stop for each day", () => {
    const copy = core.slice(core.indexOf("const copyDayToOtherDays"), core.indexOf("const footerAction"))
    expect(copy).toContain("targetSource.loadTargets({")
    expect(copy).toContain("copyPlanningDay(updated, sources, date, resolved)")
  })

  it("keeps the date compact and does not ask for visit hours", () => {
    expect(core).toContain("function CompactPlanDatePicker(")
    expect(core).toContain('managerShell.planDateOnlyHint')
    expect(core).not.toContain("const TIME_SLOTS")
    expect(core).not.toContain("function RouteTimeInput(")
    expect(core).not.toContain('managerShell.planVisitTime')
  })

  it.each(["az", "ru", "en"] as const)("has the new %s strings", (locale) => {
    const shell = mobileResources[locale].managerShell as Record<string, string>
    expect(["planAlsoOn", "planCopyDay", "planCopyDayHint", "planCopying", "planCopied_one", "planCopied_other", "planCopyNone", "planCopyFailed"].filter((key) => !shell[key])).toEqual([])
  })
})
