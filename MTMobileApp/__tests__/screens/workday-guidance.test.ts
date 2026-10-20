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
  const androidEntrySource = fs.readFileSync(
    path.resolve(__dirname, "../../App.android.ts"),
    "utf8",
  )
  const routeScreenSource = fs.readFileSync(
    path.resolve(__dirname, "../../src/screens/route/RouteScreen.tsx"),
    "utf8",
  )
  const routeScreenStateSource = fs.readFileSync(
    path.resolve(__dirname, "../../src/screens/route/route-screen-state.ts"),
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

  it("shows a minimal field-session control without adding HRM navigation", () => {
    expect(todaySource).toContain("useWorkdayStore")
    expect(todaySource).toContain("startWorkday")
    expect(todaySource).toContain("endWorkday")
    expect(todaySource).toContain("refreshRouteFieldSession")
    expect(todaySource).toContain('syncState === "CONFIRMED"')
  })

  // The manager shell came back on 2026-10-17 (owner-approved mockup): Team,
  // Plan, Approvals, More — opened only by the server's team grant
  // (role-tabs.ts mainShell). Field detail screens stay behind the AGENT
  // admission, and the old dashboard and contact transfer stay out.
  it("opens the manager shell only through the server's team grant", () => {
    expect(navigatorSource).toContain("RouteFieldAccessScreen")
    expect(navigatorSource).toContain("routeFieldAdmitted ?")
    expect(navigatorSource).toContain("mainShell({ agent, data: bootstrap, routeFieldAccess, office })")
    expect(navigatorSource).toContain("const managerShell = hasManagerShellAccess(bootstrap, agent)")
    expect(navigatorSource).toContain('<ManagerWorkspaceScreen kind="team" />')
    expect(navigatorSource).toContain('<ManagerWorkspaceScreen kind="approvals" />')
    expect(navigatorSource).not.toContain("ContactTransferScreen")
    expect(navigatorSource).not.toContain("contactTransfer")
    expect(navigatorSource).not.toContain("DashboardScreen")
  })

  it("keeps the field agent's planner self-only and the team planner in the manager shell", () => {
    expect(navigatorSource).toContain("RouteSelfPlanningWorkspace")
    // The team planner is registered only under `managerShell`.
    const managerBlock = navigatorSource.slice(navigatorSource.indexOf("{managerShell ? ("))
    expect(managerBlock).toContain('<Stack.Screen name="PlanningBuilder" component={withFieldColorScheme(ManagerPlanningBuilderScreen)} />')
    const fieldBlock = navigatorSource.slice(navigatorSource.indexOf("{routeFieldAdmitted ? ("), navigatorSource.indexOf("{managerShell ? ("))
    expect(fieldBlock).toContain('<Stack.Screen name="PlanningBuilder" component={withFieldColorScheme(PlanningBuilderScreen)} />')
    expect(fieldBlock).not.toContain("ManagerPlanning")
    expect(navigatorSource).not.toContain('mode="self"')
    expect(selfPlannerSource).not.toContain("manager-api")
    expect(selfPlannerSource).not.toContain("commercial-api")
    expect(selfPlannerSource).not.toContain("../manager/")
    expect(selfPlannerSource).toContain("api.getRoutePlanningTargets")
    expect(plannerCoreSource).not.toContain("manager-api")
    expect(plannerCoreSource).not.toContain("commercial-api")
    expect(plannerCoreSource).not.toContain("api.getOrganizations")
    expect(plannerCoreSource).not.toContain("api.getContacts")
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

  it("starts the Android runtime only after the server-confirmed field session becomes active", () => {
    expect(androidEntrySource).toContain('"./src/runtime/AndroidApp"')
    expect(runtimeSource).toContain("refreshRouteFieldSession")
    expect(runtimeSource).toContain("startTracking")
    expect(runtimeSource).toContain("useWorkdayStore")
    expect(runtimeSource).toContain('syncState === "CONFIRMED"')
    expect(runtimeSource).toContain("stopTracking().catch")
    expect(runtimeSource).toContain('AppState.currentState !== "active"')
    expect(runtimeSource).not.toContain("ACCESS_BACKGROUND_LOCATION")
    expect(manifestSource).toContain('android:name="android.permission.FOREGROUND_SERVICE"')
    expect(manifestSource).toContain('android:name="android.permission.FOREGROUND_SERVICE_LOCATION"')
    expect(manifestSource).toContain("android.permission.WAKE_LOCK")
    expect(manifestSource).toContain("RNBackgroundActionsTask")
    expect(manifestSource).toContain('android:foregroundServiceType="location"')
  })

  it("keeps planned routes view-only until the day and then the route are explicitly started", () => {
    expect(routeScreenSource).toContain("RouteExecutionGate")
    expect(routeScreenSource).toContain("workdayActive")
    // The panel choice moved into a pure function (2026-09-14) so it can also
    // wait while the route is loading; the rule itself did not change.
    expect(routeScreenSource).toContain("routeStatus: route?.status")
    expect(routeScreenStateSource).toContain('workdayActive && hasRoute && routeStatus === "IN_PROGRESS"')
    expect(routeScreenSource).toContain("submitRouteCommand")
    expect(routeScreenSource).toContain('command: "START"')
  })

  it.each(["ru", "en", "az"] as const)("ships a clear %s Route Field access state", (locale) => {
    const copy = mobileResources[locale].routeFieldAccess
    expect(copy.checkingTitle).toBeTruthy()
    expect(copy.disabledBody).toBeTruthy()
    expect(copy.unavailableBody).toBeTruthy()
    expect(copy.syncBlocked).toBeTruthy()
  })
})
