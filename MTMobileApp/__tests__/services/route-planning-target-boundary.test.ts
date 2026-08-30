import fs from "fs"
import path from "path"

const apiSource = fs.readFileSync(path.resolve(__dirname, "../../src/services/api.ts"), "utf8")
const routePlannerSource = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/route/RouteSelfPlanningWorkspace.android.tsx"),
  "utf8",
)
const plannerCoreSource = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/planning/PlanningWorkspaceCore.android.tsx"),
  "utf8",
)

describe("Route Field planning target v2 boundary", () => {
  it("uses only the date-bound v2 lookup and treats pagination as opaque", () => {
    expect(apiSource).toContain("async getRoutePlanningTargets(")
    expect(apiSource).toContain('/mobile/route-field/planning-targets?${query.toString()}')
    expect(routePlannerSource).toContain("api.getRoutePlanningTargets")
    expect(routePlannerSource).toContain("query.continuation")
    expect(routePlannerSource).toContain("response?.data?.date !== query.date")
    expect(routePlannerSource).not.toContain("manager-api")
    expect(routePlannerSource).not.toContain("commercial-api")
    expect(routePlannerSource).not.toContain("api.getOrganizations")
    expect(routePlannerSource).not.toContain("api.getContacts")
    expect(plannerCoreSource).toContain("targetSource.loadTargets")
    expect(plannerCoreSource).toContain("targetNextPage?.queryKey === targetQueryKey")
    expect(plannerCoreSource).toContain("continuation.queryKey !== targetQueryKey")
    expect(plannerCoreSource).toContain("continuation: continuation.cursor")
    expect(plannerCoreSource).not.toContain("api.getOrganizations")
    expect(plannerCoreSource).not.toContain("api.getContacts")
    expect(plannerCoreSource).not.toContain("readOfflineOrganizations")
    expect(plannerCoreSource).not.toContain("readOfflineContacts")
  })
})
