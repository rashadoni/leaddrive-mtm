import fs from "fs"
import path from "path"
import { mobileResources } from "../../src/i18n/mobile-resources"

describe("mobile planning guidance", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../../src/screens/manager/ManagerPlanningWorkspace.android.tsx"),
    "utf8",
  )
  const calendarSource = fs.readFileSync(
    path.resolve(__dirname, "../../src/screens/manager/ManagerPlanningCalendarScreen.android.tsx"),
    "utf8",
  )

  it("keeps one contextual hint for each planner step and lets the user reopen it", () => {
    expect(source).toContain('planning.${singleDay ? "day" : "week"}.step.${step}')
    expect(source).toContain('managerShell.planHelpAction')
    expect(source).toContain('managerShell.planHelpDayStep1')
    expect(source).toContain('managerShell.planHelpWeekStep3')
    expect(source).toContain("<PlannerCoach")
    expect(source).toContain("dismissHint(planningHintId)")
  })

  it.each(["ru", "en", "az"] as const)("ships complete %s planner help copy", (locale) => {
    const copy = mobileResources[locale].managerShell
    expect(copy.planHelpAction).toBeTruthy()
    expect(copy.planHelpTitle).toBeTruthy()
    expect(copy.planHelpDayStep1).toBeTruthy()
    expect(copy.planHelpDayStep2).toBeTruthy()
    expect(copy.planHelpDayStep3).toBeTruthy()
    expect(copy.planHelpWeekStep1).toBeTruthy()
    expect(copy.planHelpWeekStep2).toBeTruthy()
    expect(copy.planHelpWeekStep3).toBeTruthy()
    expect(copy.planHelpDismiss).toBeTruthy()
  })

  it("keeps one-day routes and the seven-day weekly planner as visibly different flows", () => {
    expect(source).toContain("([1, 7] as PlanningHorizon[])")
    expect(source).toContain('managerShell.planRouteDate')
    expect(source).toContain('managerShell.planWeekStart')
    expect(source).toContain("<WeekDayChooser")
    expect(source).toContain('testID="mtm-mobile-week-day-list"')
    expect(source).toContain("<DayPlanEditor")
    expect(source).toContain("planningLocalTimeToIso")
    expect(source).not.toContain("<MatrixRow")
  })

  it("keeps long planning data inside compact scrollers and the next action always reachable", () => {
    expect(source).toContain("<PlannerActionDock")
    expect(source).toContain("nestedScrollEnabled")
    expect(source).toContain("styles.agentListScroller")
    expect(source).toContain("styles.targetListScroller")
    expect(source).toContain("horizontal nestedScrollEnabled")
    expect(calendarSource).toContain("styles.agendaListScroller")
  })

  it("uses tenant-configured target types instead of hardcoded doctor and pharmacy tabs", () => {
    expect(source).toContain("routeTargetTypes.map")
    expect(source).toContain("mobileRouteTargetLabel")
    expect(source).toContain("activeTargetType?.objectType")
    expect(source).toContain('managerShell.planChooseTargetTypeHelp')
  })

  it("carries the calendar day into a new one-day route instead of asking for it again", () => {
    expect(calendarSource).toContain('initialDate: selectedDate, initialHorizon: 1')
    expect(source).toContain("initialDate?: string")
    expect(source).toContain("initialHorizon?: PlanningHorizon")
})
})
