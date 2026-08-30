import fs from "fs"
import path from "path"

const apiSource = fs.readFileSync(path.resolve(__dirname, "../../src/services/api.ts"), "utf8")
const selfPlannerSource = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/route/RouteSelfPlanningWorkspace.android.tsx"),
  "utf8",
)
const todaySource = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/today/TodayScreen.tsx"),
  "utf8",
)
const coreSource = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/planning/PlanningWorkspaceCore.android.tsx"),
  "utf8",
)
const legacyManagerSource = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/manager/ManagerPlanningWorkspace.android.tsx"),
  "utf8",
)

describe("Route Field durable command boundary", () => {
  it("uses only the additive command endpoint for the active self planner", () => {
    expect(apiSource).toContain('this.request("/mobile/route-commands"')
    expect(apiSource).toContain('headers: { "x-field-device-id": deviceId }')
    expect(selfPlannerSource).toContain("submitRouteCommand")
    expect(selfPlannerSource).toContain("api.executeRouteCommand")
    expect(selfPlannerSource).not.toContain("api.createRouteDraft")
    expect(selfPlannerSource).not.toContain("api.updateRouteDraft")
    expect(selfPlannerSource).not.toContain("api.publishRoute")
  })

  it("keeps direct legacy writes outside the Route Field self-planner transport", () => {
    expect(coreSource).toContain("writeSource.saveDraft")
    expect(coreSource).toContain("writeSource.publishDraft")
    expect(coreSource).not.toContain("api.createRouteDraft")
    expect(coreSource).not.toContain("api.updateRouteDraft")
    expect(coreSource).not.toContain("api.publishRoute")
    expect(legacyManagerSource).toContain("api.createRouteDraft")
    expect(legacyManagerSource).toContain("api.updateRouteDraft")
    expect(legacyManagerSource).toContain("api.publishRoute")
  })

  it("starts a route through the durable command transport, never a workday or direct route write", () => {
    expect(todaySource).toContain('command: "START"')
    expect(todaySource).toContain("submitRouteCommand")
    expect(todaySource).toContain("api.executeRouteCommand")
    expect(todaySource).not.toContain("useWorkdayStore")
    expect(todaySource).not.toContain("api.updateRoute")
    expect(todaySource).not.toContain("api.createRoute")
  })
})
