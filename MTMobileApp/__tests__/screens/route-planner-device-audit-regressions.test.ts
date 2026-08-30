import fs from "fs"
import path from "path"
import { mobileResources } from "../../src/i18n/mobile-resources"

const source = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/planning/PlanningWorkspaceCore.android.tsx"),
  "utf8",
)

describe("route planner device-audit regressions", () => {
  it("uses a touch picker instead of an editable hour field", () => {
    expect(source).toContain("function PlanningTimePickerSheet")
    expect(source).toContain('animationType="slide"')
    expect(source).toContain("planningTimeMinuteOptions(value)")
    expect(source).not.toContain("function RouteTimeInput")
    expect(source).not.toContain("routeTimeHourInput")
  })

  it("keeps the single-day review focused and hides unavailable publishing", () => {
    expect(source).toContain("!singleDay ? (")
    expect(source).toContain('t(canPublish ? "managerShell.planFinishMode" : "managerShell.planDraftOnlyTitle")')
    expect(source).toContain('singleDay ? "managerShell.planSaveDraftActionDay"')
  })

  it.each(["ru", "en", "az"] as const)("ships complete %s picker and count-aware removal copy", (locale) => {
    const copy = mobileResources[locale].managerShell
    expect(copy.planTimePickerTitle).toBeTruthy()
    expect(copy.planTimePickerHint).toBeTruthy()
    expect(copy.planTimePickerHour).toBeTruthy()
    expect(copy.planTimePickerMinutes).toBeTruthy()
    expect(copy.planTimePickerSave).toBeTruthy()
    expect(copy.planSaveDraftActionDay).toBeTruthy()
    expect(copy.planClearStops_one).toBeTruthy()
    expect(copy.planClearStops_other).toBeTruthy()
  })
})
