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

  it("keeps the date and customers on the same screen", () => {
    expect(core).toContain("<Text style={styles.fieldLabel}>{selfCopy.routeDate}</Text>")
    expect(core).toContain("<CompactPlanDatePicker")
    expect(core).toContain("selfCopy.chooseTargets")
  })

  it("does not ask an agent to choose between draft and publish", () => {
    expect(core).toContain('const effectiveSaveMode: SaveMode = selfPlanning ? (canPublish ? "publish" : "draft") : saveMode')
    expect(core).toContain("label: saving ? selfCopy.savingRoute : selfCopy.saveRoute")
    expect(core).toContain("? selfCopy.savedRoute")
    expect(core).toContain("{editing || selfPlanning ? null : (")
    expect(core).toContain("showBack={editing || (!selfPlanning && step > 1)}")
  })
})
