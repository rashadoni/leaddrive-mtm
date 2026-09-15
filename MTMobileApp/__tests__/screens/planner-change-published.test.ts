import fs from "fs"
import path from "path"

/**
 * Owner bug 2026-09-15: "I chose a route with these customers and published
 * it, and then I can't change it — can't pick another customer or remove one."
 *
 * A published day used to be locked whole: a lock pill, a lock on every stop,
 * a disabled search, and a notice telling the agent to save a draft or pick
 * another day. These checks pin the way back in and the rules it keeps.
 */
const read = (relative: string) => fs.readFileSync(path.resolve(__dirname, relative), "utf8")
const core = read("../../src/screens/planning/PlanningWorkspaceCore.android.tsx")
const selfPlanner = read("../../src/screens/route/RouteSelfPlanningWorkspace.android.tsx")
const routeScreen = read("../../src/screens/route/RouteScreen.tsx")
const navigator = read("../../src/navigation/AppNavigatorAndroidV2.tsx")
const manager = read("../../src/screens/manager/ManagerPlanningWorkspace.android.tsx")

describe("«Planı dəyiş» in the planner", () => {
  it("offers the change on a published day instead of only a lock", () => {
    expect(core).toContain('t("managerShell.planChangePublished")')
    expect(core).toContain("publishedRouteForDay(routes, activeDate, agentId)")
    expect(core).toContain('title={t("managerShell.planPublishedReadOnlyTitle")}')
    // The day is editable while its editor is open, and only that day.
    expect(core).toContain("const activeDateEditable = editingActiveDate || (")
    expect(core).toContain("disabled={saving || editing}")
  })

  it("keeps visited stops fixed and says why", () => {
    expect(core).toContain('t("managerShell.planVisitedStop")')
    expect(core).toContain("editStops.filter(isPublishedStopLocked)")
    expect(core).toContain("if (!editableEditStop(target, date)) return")
    expect(core).toContain("if (isPublishedStopLocked(existing)) return")
  })

  it("publishes with the version it opened and cancels without a system dialog", () => {
    expect(core).toContain("expectedVersion: session.version")
    expect(core).toContain("points: buildUpdatePublishedPoints(stops)")
    expect(core).toContain('t("managerShell.planPublishEdit")')
    expect(core).toContain('t("managerShell.planCancelEdit")')
    expect(core).toContain('title: t("managerShell.planEditUpdated")')
    expect(core).not.toContain("Alert.alert")
  })

  it("refreshes the plan after a change and after a refusal that reloads", () => {
    const publish = core.slice(core.indexOf("const publishPublishedEdit = async"), core.indexOf("const editAction = {"))
    expect(publish).toContain("await loadPlan(operationAgentId, operationDates, true)")
    expect(publish).toContain("publishedRouteEditErrorOutcome(error)")
    expect(publish).toContain('outcome.action === "keep-edit"')
    expect(publish).toContain('outcome.action === "restart-edit"')
    expect(publish).toContain("useSyncStatusStore.getState().online === false")
  })

  it("is supplied only by the agent's own planner, never by the team planner", () => {
    expect(selfPlanner).toContain("publishedEditSource={publishedEditSource}")
    expect(selfPlanner).toContain("submitPublishedRouteUpdate(")
    expect(selfPlanner).toContain("api.executeRouteCommand(request)")
    expect(manager).not.toContain("publishedEditSource")
  })
})

describe("«Planı dəyiş» on the Route tab", () => {
  it("opens today's own published route straight in the editor", () => {
    expect(routeScreen).toContain('routeOrigin === "live"')
    expect(routeScreen).toContain("publishedRouteEditAvailability({")
    expect(routeScreen).toContain("editPublished: true")
    expect(routeScreen).toContain('t("managerShell.planChangePublished")')
    expect(navigator).toContain("editPublished={route.params?.editPublished}")
    expect(selfPlanner).toContain("initialEditPublished={editPublished === true}")
  })

  it("refuses offline with the app's own notice", () => {
    const open = routeScreen.slice(routeScreen.indexOf("const openChangePlan = () =>"), routeScreen.indexOf("const handleStartRoute = async"))
    expect(open).toContain('changePlanAvailability === "offline"')
    expect(open).toContain('message: t("managerShell.planEditOffline")')
  })
})
