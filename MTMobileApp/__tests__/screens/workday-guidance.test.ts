import fs from "fs"
import path from "path"
import { mobileResources } from "../../src/i18n/mobile-resources"

describe("Route Field product boundary", () => {
  const todaySource = fs.readFileSync(
    path.resolve(__dirname, "../../src/screens/today/TodayScreen.tsx"),
    "utf8",
  )
  const navigatorSource = fs.readFileSync(
    path.resolve(__dirname, "../../src/navigation/AppNavigatorAndroidV2.tsx"),
    "utf8",
  )
  const selfPlannerSource = fs.readFileSync(
    path.resolve(__dirname, "../../src/screens/route/RouteSelfPlanningWorkspace.android.tsx"),
    "utf8",
  )
  const plannerCoreSource = fs.readFileSync(
    path.resolve(__dirname, "../../src/screens/planning/PlanningWorkspaceCore.android.tsx"),
    "utf8",
  )
  const legacyPlannerSource = fs.readFileSync(
    path.resolve(__dirname, "../../src/screens/manager/ManagerPlanningWorkspace.android.tsx"),
    "utf8",
  )
  const runtimeSource = fs.readFileSync(
    path.resolve(__dirname, "../../src/runtime/AndroidApp.tsx"),
    "utf8",
  )
  const manifestSource = fs.readFileSync(
    path.resolve(__dirname, "../../android/app/src/main/AndroidManifest.xml"),
    "utf8",
  )
  const weekSource = fs.readFileSync(
    path.resolve(__dirname, "../../src/screens/week/WeekScreen.tsx"),
    "utf8",
  )
  const routeContactSource = fs.readFileSync(
    path.resolve(__dirname, "../../src/screens/base/RouteContactDetailScreen.android.tsx"),
    "utf8",
  )
  const routeOrganizationSource = fs.readFileSync(
    path.resolve(__dirname, "../../src/screens/base/RouteOrganizationExplorerScreen.android.tsx"),
    "utf8",
  )
  const tasksSource = fs.readFileSync(
    path.resolve(__dirname, "../../src/screens/tasks/TasksScreen.tsx"),
    "utf8",
  )
  const taskDetailSource = fs.readFileSync(
    path.resolve(__dirname, "../../src/screens/tasks/TaskDetailScreen.tsx"),
    "utf8",
  )
  const routeOrganizationDetailSource = fs.readFileSync(
    path.resolve(__dirname, "../../src/screens/base/RouteOrganizationDetailScreen.android.tsx"),
    "utf8",
  )
  const visitWorkspaceSource = fs.readFileSync(
    path.resolve(__dirname, "../../src/screens/visit/VisitWorkspaceScreen.tsx"),
    "utf8",
  )

  it("does not create or reconcile HRM workdays from the route home screen", () => {
    expect(todaySource).not.toContain("useWorkdayStore")
    expect(todaySource).not.toContain("startWorkday")
    expect(todaySource).not.toContain("endWorkday")
  })

  it("does not expose the manager shell from Route Field navigation", () => {
    expect(navigatorSource).toContain("RouteFieldAccessScreen")
    expect(navigatorSource).toContain("routeFieldAdmitted ?")
    expect(navigatorSource).not.toContain("ManagerWorkspaceScreen")
    expect(navigatorSource).not.toContain("ContactTransferScreen")
    expect(navigatorSource).not.toContain("DashboardScreen")
  })

  it("keeps the active route planner self-only and its manager facade unreachable", () => {
    expect(navigatorSource).toContain("RouteSelfPlanningWorkspace")
    expect(navigatorSource).not.toContain("ManagerPlanningWorkspace")
    expect(navigatorSource).not.toContain('mode="self"')
    expect(selfPlannerSource).not.toContain("manager-api")
    expect(selfPlannerSource).not.toContain("../manager/")
    expect(plannerCoreSource).not.toContain("manager-api")
    expect(plannerCoreSource).not.toContain("useAuthStore")
    expect(legacyPlannerSource).toContain("managerApi.getTeam")
  })

  it("does not pull team schedules, commercial mutations, or manager task writes into Route Field", () => {
    expect(weekSource).not.toContain("getTeamSchedule")
    expect(weekSource).not.toContain("team-schedule")
    expect(routeContactSource).not.toContain("runMobileSync")
    expect(routeContactSource).not.toContain("BrandPotential")
    expect(routeContactSource).not.toContain("DoctorAssessment")
    expect(routeContactSource).not.toContain("queueBrand")
    expect(routeContactSource).not.toContain("../../services/contact-detail")
    expect(routeOrganizationDetailSource).toContain("api.getRouteOrganizationDetail")
    expect(routeOrganizationDetailSource).not.toContain("api.getOrganization(")
    expect(routeOrganizationDetailSource).not.toContain("field-potential")
    expect(routeOrganizationDetailSource).not.toContain("managingManager")
    expect(routeOrganizationDetailSource).not.toContain("agentAssignments")
    expect(routeOrganizationDetailSource).not.toContain("fieldPotentials")
    expect(routeOrganizationDetailSource).not.toContain("commercial")
    expect(visitWorkspaceSource).not.toContain("data.potential")
    expect(tasksSource).not.toContain("getManagerTeam")
    expect(tasksSource).not.toContain("bulkReassignTasks")
    expect(tasksSource).not.toContain("isManagerRole")
    expect(taskDetailSource).not.toContain("updateTaskFields")
    expect(taskDetailSource).not.toContain("duplicateTask")
    expect(taskDetailSource).not.toContain("returnTask")
    expect(taskDetailSource).not.toContain("isManagerRole")
  })

  it("uses a route-only organization catalog without team assignment controls", () => {
    expect(routeOrganizationSource).not.toContain("manager-api")
    expect(routeOrganizationSource).not.toContain("getOrganizationFacets")
    expect(routeOrganizationSource).not.toContain("getOrganizationViews")
    expect(routeOrganizationSource).not.toContain("previewOrganizationAssignment")
    expect(routeOrganizationSource).not.toContain("managingManager")
    expect(routeOrganizationSource).not.toContain("assignedAgentId")
    expect(routeOrganizationSource).not.toContain("assignmentState")
  })

  it("stops inherited tracking and does not start HRM-workday background GPS", () => {
    expect(runtimeSource).toContain("stopTracking().catch")
    expect(runtimeSource).not.toContain("startTracking")
    expect(runtimeSource).not.toContain("useWorkdayStore")
    expect(manifestSource).not.toContain("ACCESS_BACKGROUND_LOCATION")
    expect(manifestSource).not.toContain("RNBackgroundActionsTask")
  })

  it.each(["ru", "en", "az"] as const)("ships a clear %s Route Field access state", (locale) => {
    const copy = mobileResources[locale].routeFieldAccess
    expect(copy.checkingTitle).toBeTruthy()
    expect(copy.disabledBody).toBeTruthy()
    expect(copy.unavailableBody).toBeTruthy()
    expect(copy.syncBlocked).toBeTruthy()
  })
})
