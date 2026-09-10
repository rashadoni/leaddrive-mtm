import fs from "fs"
import path from "path"
import { mobileResources } from "../../src/i18n/mobile-resources"
import {
  FIELD_ELIGIBILITY_REASONS,
  fieldEligibilityReason,
  fieldEligibilityReasonKey,
} from "../../src/lib/field-eligibility-reason"

/**
 * Field UX audit 2026-09-05, task B8 (and M-03, the dead end it describes).
 *
 * The self planner asked "who is going and on which day" in a mode where there
 * is nobody to choose, printed four paragraphs before the first control, and
 * explained an empty list by telling a field agent to assign a territory in
 * the web app — a screen only a manager can open. Meanwhile the server had
 * been fixed (A2) to say WHY the list is empty, and the app threw that away.
 */
const core = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/planning/PlanningWorkspaceCore.android.tsx"),
  "utf8",
)
const wrapper = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/route/RouteSelfPlanningWorkspace.android.tsx"),
  "utf8",
)

describe("B8: the self planner asks only what it can answer", () => {
  it("carries the server's reason instead of dropping it at the transport", () => {
    expect(wrapper).toContain("fieldEligibilityReason(response?.data?.eligibility?.reason)")
    expect(wrapper).toContain("return { targets, nextPage, eligibility }")
    expect(core).toContain("setTargetEligibility(page.eligibility ?? null)")
  })

  it("shows that reason on the empty list", () => {
    expect(core).toContain("t(fieldEligibilityReasonKey(targetEligibility))")
  })

  it("stops sending a field agent to a screen only a manager can open", () => {
    const bodies = (["ru", "en", "az"] as const).map(
      (locale) => (mobileResources[locale].managerShell as Record<string, string>).planNoTargetsBody,
    )
    for (const body of bodies) {
      expect(body).toBeTruthy()
      expect(body.toLowerCase()).not.toMatch(/веб-верси|web app|veb versiya/)
    }
  })

  it("has a sentence for every reason the server can send, in three languages", () => {
    const missing: string[] = []
    for (const locale of ["ru", "en", "az"] as const) {
      const shell = mobileResources[locale].managerShell as Record<string, string>
      for (const reason of FIELD_ELIGIBILITY_REASONS) {
        const key = fieldEligibilityReasonKey(reason).replace("managerShell.", "")
        if (typeof shell[key] !== "string" || !shell[key].trim()) missing.push(`${locale}.${key}`)
      }
    }
    expect(missing).toEqual([])
  })

  it("refuses a reason it does not know rather than inventing one", () => {
    // Guessing is exactly how the old "assign a territory" hint got written.
    expect(fieldEligibilityReason("assignment")).toBe("assignment")
    expect(fieldEligibilityReason("NO_EFFECTIVE_ASSIGNMENTS")).toBeNull()
    expect(fieldEligibilityReason(undefined)).toBeNull()
    expect(fieldEligibilityReason(42)).toBeNull()
  })

  it("does not ask a lone agent to pick an employee", () => {
    expect(core).toContain('t("managerShell.planSelfStepSetup")')
    expect(core).toContain("{selfPlanning ? null : (")
    // The panel was one locked row carrying the agent's own name.
    expect(core).not.toContain("selfCopy.agentLabel")
    expect(core).not.toContain("selfCopy.agentHelp")
  })

  it("puts the controls above the reading material", () => {
    // The "?" had a row of its own between the stepper and the first control.
    expect(core).not.toContain("styles.helpRow")
    const header = core.slice(core.indexOf("<View style={styles.headerCopy}>"), core.indexOf("<ScrollView"))
    expect(header).toContain("styles.helpButton")
  })

  it("names the date once on the step that no longer chooses it", () => {
    expect(core).toContain("{singleDay ? null : (")
    for (const locale of ["ru", "en", "az"] as const) {
      const shell = mobileResources[locale].managerShell as Record<string, string>
      expect(shell.planSelectionSummaryDay).not.toContain("·")
      expect(shell.planStepTargetsDayBody.split(/[.!?]/).filter((part) => part.trim())).toHaveLength(1)
    }
  })
})
