import fs from "fs"
import path from "path"
import { mobileResources } from "../../src/i18n/mobile-resources"

describe("mobile planning guidance", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../../src/screens/manager/ManagerPlanningWorkspace.android.tsx"),
    "utf8",
  )

  it("keeps one contextual hint for each planner step and lets the user reopen it", () => {
    expect(source).toContain("planning.step.${step}")
    expect(source).toContain('managerShell.planHelpAction')
    expect(source).toContain('managerShell.planHelpStep${step}')
    expect(source).toContain("<PlannerCoach")
    expect(source).toContain("dismissHint(planningHintId)")
  })

  it.each(["ru", "en", "az"] as const)("ships complete %s planner help copy", (locale) => {
    const copy = mobileResources[locale].managerShell
    expect(copy.planHelpAction).toBeTruthy()
    expect(copy.planHelpTitle).toBeTruthy()
    expect(copy.planHelpStep1).toBeTruthy()
    expect(copy.planHelpStep2).toBeTruthy()
    expect(copy.planHelpStep3).toBeTruthy()
    expect(copy.planHelpDismiss).toBeTruthy()
  })
})
