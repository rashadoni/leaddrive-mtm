import fs from "fs"
import path from "path"

const core = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/planning/PlanningWorkspaceCore.android.tsx"),
  "utf8",
)

describe("self planner uses one direct flow", () => {
  it("opens directly on the one-day customer picker", () => {
    expect(core).toContain("useState<PlanningStep>(() => selfPlanning ? 2 : 1)")
    expect(core).toContain("useState<PlanningHorizon>(() => selfPlanning ? 1 : initialHorizon ?? 7)")
    expect(core).toContain("{selfPlanning ? null : <StepRail")
  })

  it("keeps the customers and the day on the same screen, the day last", () => {
    // Owner, 2026-10-17 («День в конце»): planner-self-day-last.test.ts.
    expect(core).toContain("selfCopy.chooseTargets")
    expect(core).toContain("<SelfDayChooser")
    expect(core).not.toContain("selfCopy.routeDate")
  })

  it("does not ask an agent to choose between draft and publish", () => {
    expect(core).toContain('const effectiveSaveMode: SaveMode = selfPlanning ? (canPublish ? "publish" : "draft") : saveMode')
    expect(core).toContain("label: saving ? selfCopy.savingRoute : selfCopy.saveRoute")
    expect(core).toContain("? selfCopy.savedRoute")
    expect(core).toContain("{editing || selfPlanning ? null : (")
    expect(core).toContain("showBack={editing || (!selfPlanning && step > 1)}")
  })
})
