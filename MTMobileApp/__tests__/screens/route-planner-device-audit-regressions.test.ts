import fs from "fs"
import path from "path"
import { mobileResources } from "../../src/i18n/mobile-resources"

const source = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/planning/PlanningWorkspaceCore.android.tsx"),
  "utf8",
)

describe("route planner device-audit regressions", () => {
  it("uses practical touch slots instead of editable hour/minute fields", () => {
    expect(source).toContain("function PlanningTimePickerSheet")
    expect(source).toContain('animationType="slide"')
    expect(source).toContain("planningQuickTimeSlots")
    expect(source).toContain("planningTimeSlots")
    expect(source).not.toContain("function RouteTimeInput")
    expect(source).not.toContain("routeTimeHourInput")
  })

  it("keeps the single-day review focused and hides unavailable publishing", () => {
    expect(source).toContain("!singleDay ? (")
    expect(source).toContain('t(canPublish ? "managerShell.planFinishMode" : "managerShell.planDraftOnlyTitle")')
    expect(source).toContain('"managerShell.planSaveDraftActionDay"')
  })

  it.each(["ru", "en", "az"] as const)("ships complete %s picker and count-aware removal copy", (locale) => {
    const copy = mobileResources[locale].managerShell
    expect(copy.planTimePickerTitle).toBeTruthy()
    expect(copy.planTimePickerHint).toBeTruthy()
    expect(copy.planTimePickerQuick).toBeTruthy()
    expect(copy.planTimePickerPeriod).toBeTruthy()
    expect(copy.planTimePickerMorning).toBeTruthy()
    expect(copy.planTimePickerEvening).toBeTruthy()
    expect(copy.planSaveDraftActionDay).toBeTruthy()
    expect(copy.planClearStops_one).toBeTruthy()
    expect(copy.planClearStops_other).toBeTruthy()
  })
})
