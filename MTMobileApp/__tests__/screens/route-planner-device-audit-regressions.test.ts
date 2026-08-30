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

  it("keeps the single-day review focused and publishes an allowed self route without a workflow choice", () => {
    expect(source).toContain("!singleDay ? (")
    expect(source).toContain('t(selfPlanning && canPublish ? "managerShell.planSelfPublishTitle" : canPublish ? "managerShell.planFinishMode" : "managerShell.planDraftOnlyTitle")')
    expect(source).toContain('if (selfPlanning) setSaveMode(canPublish ? "publish" : "draft")')
    expect(source).toContain('selfPlanning && canPublish ? (')
    expect(source).toContain('selfPlanning ? "managerShell.planCreateRoute" : "managerShell.planSaveAndPublish"')
    expect(source).toContain('if (returnToToday) onPublished?.()')
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
    expect(copy.planCreateRoute).toBeTruthy()
    expect(copy.planSelfPublishTitle).toBeTruthy()
    expect(copy.planSelfPublishHelp).toBeTruthy()
    expect(copy.planSelfPublishReady).toBeTruthy()
    expect(copy.planClearStops_one).toBeTruthy()
    expect(copy.planClearStops_other).toBeTruthy()
  })
})
