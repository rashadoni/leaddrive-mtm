import fs from "fs"
import path from "path"
import { mobileResources } from "../../src/i18n/mobile-resources"

/**
 * Found while saving a real route from the phone (2026-09-13), not in the
 * audit's task list. After «Qaralamaları saxla» the only text in view was the
 * dock's «Saxlanacaq qaralama yoxdur.», which reads as a failure; the success
 * message was above the fold.
 */
const core = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/planning/PlanningWorkspaceCore.android.tsx"),
  "utf8",
)

describe("self planner: the result of a save is what you see", () => {
  it("scrolls the result into view", () => {
    expect(core).toContain("ref={workspaceScrollRef}")
    expect(core).toContain("if (saveMessage) workspaceScrollRef.current?.scrollTo({ y: 0, animated: true })")
  })

  it("does not say there is nothing to save right after saving", () => {
    expect(core).toContain("hint: !canSave && !saving && !saveMessage ?")
  })

  it("names one draft in the singular", () => {
    expect(core).toContain('writes.length > 1 ? "managerShell.planSaveDraftAction" : "managerShell.planSaveDraftActionOne"')
    const one = (["az", "ru", "en"] as const).map((lang) => (mobileResources as any)[lang].managerShell.planSaveDraftActionOne)
    expect(one).toEqual(["Qaralamanı saxla", "Сохранить черновик", "Save draft"])
  })

  it("leaves the phone header's width to the title", () => {
    expect(core).toContain('{tablet ? <View style={styles.headerIcon}>')
  })
})
