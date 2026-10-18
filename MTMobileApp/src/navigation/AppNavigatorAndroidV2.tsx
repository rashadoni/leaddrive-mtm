import React, { useEffect } from "react"
import { ActivityIndicator, StyleSheet, useWindowDimensions, View } from "react-native"
import { DarkTheme, DefaultTheme, NavigationContainer, type Theme } from "@react-navigation/native"
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import { useAuthStore } from "../store/auth"
import { useBootstrapStore } from "../store/bootstrap"
import { hasRouteFieldAccess } from "../services/bootstrap"
import { fieldContactsEnabled } from "../lib/field-contacts-policy"
import { fieldColorScheme, fieldTheme } from "../theme/fieldTheme"
import { NAV_RAIL_WIDTH, shouldUseNavigationRail } from "../theme/layoutBreakpoints"

const RAIL_WIDTH = NAV_RAIL_WIDTH
import { TAB_BAR_BASE_HEIGHT } from "../theme/tabBarMetrics"

import ServerScreen from "../screens/server/ServerScreen"
import LoginScreen from "../screens/auth/LoginScreen"
import RouteScreen from "../screens/route/RouteScreen"
import WeekScreen from "../screens/week/WeekScreen"
import VisitScreen from "../screens/visit/VisitScreen"
import TasksScreen from "../screens/tasks/TasksScreen"
import TaskDetailScreen from "../screens/tasks/TaskDetailScreen"
import RouteBaseScreen from "../screens/base/RouteBaseScreen.android"
import RouteOrganizationDetailScreen from "../screens/base/RouteOrganizationDetailScreen.android"
import RouteContactDetailScreen from "../screens/base/RouteContactDetailScreen.android"
import VisitWorkspaceScreen from "../screens/visit/VisitWorkspaceScreen"
import PresentationViewerScreen from "../screens/visit/PresentationViewerScreen"
import DoctorCreateRequestScreen from "../screens/base/DoctorCreateRequestScreen"
import RouteContactChangeRequestScreen from "../screens/base/RouteContactChangeRequestScreen.android"
import RouteOrganizationLocationFixScreen from "../screens/base/RouteOrganizationLocationFixScreen.android"
import GpsHistoryScreen from "../screens/gps/GpsHistoryScreen"
import ProfileScreen from "../screens/profile/ProfileScreen"
import MoreScreen from "../screens/more/MoreScreen"
import AttendanceRequestsScreen from "../screens/attendance/AttendanceRequestsScreen"
import AttendanceWorkdayScreen from "../screens/attendance/AttendanceWorkdayScreen"
import AttendanceInboxScreen from "../screens/attendance/AttendanceInboxScreen"
import AttendanceExplanationsScreen from "../screens/attendance/AttendanceExplanationsScreen"
import { hasOfficeAttendanceAccess } from "../services/attendance-access"
import { agentMayAttendanceRequests } from "../lib/agent-permissions"
import TeamMessagesScreen from "../screens/more/TeamMessagesScreen"
import NotificationsScreen from "../screens/more/NotificationsScreen"
import TodayScreen from "../screens/today/TodayScreen"
import RouteSelfPlanningWorkspace from "../screens/route/RouteSelfPlanningWorkspace.android"
import RouteFieldAccessScreen from "../screens/auth/RouteFieldAccessScreen.android"
import type { RawTask } from "../services/task-detail"
import type { MobileProductPresentation } from "../services/product-presentations"
import type { RoutePlanningTargetHint } from "../services/route-planning-target"
import ManagerWorkspaceScreen from "../screens/manager/ManagerWorkspaceScreen.android"
import ManagerEmployeeScreen from "../screens/manager/ManagerEmployeeScreen.android"
import ManagerTeamMessageScreen from "../screens/manager/ManagerTeamMessageScreen.android"
import ManagerPlanningCalendarScreen from "../screens/manager/ManagerPlanningCalendarScreen.android"
import ManagerSelfLocationShare from "../screens/manager/ManagerSelfLocationShare.android"
import ManagerPlanningWorkspace from "../screens/manager/ManagerPlanningWorkspace.android"
import { AGENT_TAB_NAMES, hasManagerShellAccess, mainShell, type ManagerTabName } from "./role-tabs"

export type RootStackParamList = {
  Main: undefined
  Login: undefined
  Server: undefined
  OrganizationDetail: { id: string; name?: string }
  ContactDetail: { id: string; name?: string }
  VisitWorkspace: { visitId: string; name?: string; section?: "presentations" | "tasks" | "summary" }
  PresentationViewer: { visitId: string; product: MobileProductPresentation }
  DoctorCreateRequest: undefined
  ContactChangeRequest: { id: string; name?: string }
  /** «Клиент здесь»: where the organization's pin stands now goes along, so the map can show it. */
  OrganizationLocationFix: { id: string; name?: string; latitude?: number; longitude?: number }
  TaskDetail: { task: RawTask }
  Visits: undefined
  Base: undefined
  GpsHistory: undefined
  Profile: undefined
  /** The manager's own-attendance screens, pushed from his workday tab. */
  OwnRequests: undefined
  OwnExplanations: undefined
  OwnInbox: undefined
  OwnProfile: undefined
  /** Type-only legacy entry keeps an unmounted manager source file type-safe;
   * it is not registered in the Route Field navigator. */
  ContactTransfer: undefined
  /** One employee from «Komanda»: the day on a map, the route, the workday (owner, 2026-10-17). */
  ManagerEmployee: { agentId: string; name?: string; isOnline?: boolean | null }
  /** «Komandaya yaz» from «Komanda»: to the whole team or one employee (owner, 2026-10-17). */
  ManagerTeamMessage: undefined
  /** The bell's list (owner-approved mockup, 2026-10-18), over the tabs in both shells. */
  Notifications: undefined
  /** The agent's own planner in the field shell; the team planner in the manager shell. */
  PlanningBuilder: { initialDate?: string; initialHorizon?: 1 | 7; editPublished?: boolean; initialTarget?: RoutePlanningTargetHint } | undefined
}

export type MoreStackParamList = {
  AttendanceRequests: undefined
  MoreHome: undefined
  /** A line of the bell opens the thread it is about. */
  Messages: { threadId?: string } | undefined
  Visits: undefined
  GpsHistory: undefined
  Profile: undefined
}

export type ClientsStackParamList = {
  ClientsHome: undefined
  OrganizationDetail: { id: string; name?: string }
  ContactDetail: { id: string; name?: string }
  DoctorCreateRequest: undefined
  ContactChangeRequest: { id: string; name?: string }
  /** «Клиент здесь»: where the organization's pin stands now goes along, so the map can show it. */
  OrganizationLocationFix: { id: string; name?: string; latitude?: number; longitude?: number }
}

/**
 * The navigator's own surfaces (a screen's background during a transition,
 * the stack's card) in the app's palette, day or night: without it a dark
 * screen flashed white while the next one slid in.
 */
const NAVIGATION_THEME: Theme = {
  ...(fieldColorScheme === "dark" ? DarkTheme : DefaultTheme),
  colors: {
    ...(fieldColorScheme === "dark" ? DarkTheme : DefaultTheme).colors,
    primary: fieldTheme.color.primary,
    background: fieldTheme.color.canvas,
    card: fieldTheme.color.surface,
    text: fieldTheme.color.ink,
    border: fieldTheme.color.border,
    notification: fieldTheme.color.danger,
  },
}

const Stack = createNativeStackNavigator<RootStackParamList>()
const MoreStack = createNativeStackNavigator<MoreStackParamList>()
const ClientsStack = createNativeStackNavigator<ClientsStackParamList>()
const Tab = createBottomTabNavigator()

const ICONS: Record<string, { active: string; inactive: string }> = {
  Today: { active: "today", inactive: "today-outline" },
  Calendar: { active: "calendar-number", inactive: "calendar-number-outline" },
  Route: { active: "navigate", inactive: "navigate-outline" },
  Clients: { active: "people", inactive: "people-outline" },
  Tasks: { active: "checkbox", inactive: "checkbox-outline" },
  More: { active: "ellipsis-horizontal-circle", inactive: "ellipsis-horizontal-circle-outline" },
  Team: { active: "people", inactive: "people-outline" },
  Planning: { active: "calendar", inactive: "calendar-outline" },
  Approvals: { active: "shield-checkmark", inactive: "shield-checkmark-outline" },
  OwnWorkday: { active: "time", inactive: "time-outline" },
}

const PlanningBuilderScreen = ({
  navigation,
  route,
}: {
  navigation: { goBack: () => void }
  route: { params?: { initialDate?: string; initialHorizon?: 1 | 7; editPublished?: boolean; initialTarget?: RoutePlanningTargetHint } }
}) => (
  <RouteSelfPlanningWorkspace
    onClose={() => navigation.goBack()}
    initialDate={route.params?.initialDate}
    initialHorizon={route.params?.initialHorizon}
    editPublished={route.params?.editPublished}
    initialTarget={route.params?.initialTarget}
  />
)

type RouteFieldTabName = typeof AGENT_TAB_NAMES[number]

/** The team planner the calendar's «create» opens; the same draft/publish API, team-scoped by the server. */
const ManagerPlanningBuilderScreen = ({
  navigation,
  route,
}: {
  navigation: { goBack: () => void }
  route: { params?: { initialDate?: string; initialHorizon?: 1 | 7 } }
}) => (
  <ManagerPlanningWorkspace
    onClose={() => navigation.goBack()}
    initialDate={route.params?.initialDate}
    initialHorizon={route.params?.initialHorizon}
  />
)
const ManagerTeamScreen = () => <ManagerWorkspaceScreen kind="team" />
const ManagerApprovalsScreen = () => <ManagerWorkspaceScreen kind="approvals" />

// The manager's own workday and «more» leave out what is not his to use
// there (owner, 2026-10-17 — see the screens' managerShell).
const ManagerOwnWorkdayScreen = () => <AttendanceWorkdayScreen managerShell />
const ManagerMoreScreen = () => <ProfileScreen managerShell managerCard={<ManagerSelfLocationShare />} />

const MANAGER_TAB_COMPONENTS: Record<ManagerTabName, React.ComponentType<any>> = {
  Team: ManagerTeamScreen,
  Planning: ManagerPlanningCalendarScreen,
  Approvals: ManagerApprovalsScreen,
  OwnWorkday: ManagerOwnWorkdayScreen,
  // Profile, language and sign-out: the one «more» a manager needs here.
  More: ManagerMoreScreen,
}

const MANAGER_TAB_LABEL_KEYS: Record<ManagerTabName, string> = {
  Team: "navV2.team",
  Planning: "navV2.planning",
  Approvals: "navV2.approvals",
  OwnWorkday: "officeAttendance.workday",
  More: "navV2.more",
}

function MoreStackNavigator() {
  const policies = useBootstrapStore(state => state.data?.policies)
  const role = useAuthStore(state => state.agent?.role)
  const attendanceAllowed = role === "AGENT" && agentMayAttendanceRequests(policies)
  return (
    <MoreStack.Navigator screenOptions={{ headerShown: false }}>
      <MoreStack.Screen name="MoreHome" component={MoreScreen} />
      {attendanceAllowed && <MoreStack.Screen name="AttendanceRequests" component={AttendanceRequestsScreen} />}
      <MoreStack.Screen name="Messages" component={TeamMessagesScreen} />
      <MoreStack.Screen name="Visits" component={VisitScreen} />
      <MoreStack.Screen name="GpsHistory" component={GpsHistoryScreen} />
      <MoreStack.Screen name="Profile" component={ProfileScreen} />
    </MoreStack.Navigator>
  )
}

function ClientsStackNavigator() {
  return (
    <ClientsStack.Navigator screenOptions={{ headerShown: false }}>
      <ClientsStack.Screen name="ClientsHome" component={RouteBaseScreen} />
      <ClientsStack.Screen name="OrganizationDetail" component={RouteOrganizationDetailScreen} />
      <ClientsStack.Screen name="ContactDetail" component={RouteContactDetailScreen} />
      <ClientsStack.Screen name="DoctorCreateRequest" component={DoctorCreateRequestScreen} />
      <ClientsStack.Screen name="ContactChangeRequest" component={RouteContactChangeRequestScreen} />
      <ClientsStack.Screen name="OrganizationLocationFix" component={RouteOrganizationLocationFixScreen} />
    </ClientsStack.Navigator>
  )
}

const TAB_COMPONENTS: Record<RouteFieldTabName, React.ComponentType<any>> = {
  Today: TodayScreen,
  Calendar: WeekScreen,
  Route: RouteScreen,
  Clients: ClientsStackNavigator,
  Tasks: TasksScreen,
  More: MoreStackNavigator,
}

const TAB_LABEL_KEYS: Record<RouteFieldTabName, string> = {
  Today: "navV2.today",
  Calendar: "navV2.calendar",
  Route: "navV2.route",
  Clients: "navV2.clients",
  Tasks: "navV2.tasks",
  More: "navV2.more",
}

function tabOptions(name: string, label: string, iconOverride?: { active: string; inactive: string }) {
  return {
    title: label,
    tabBarIcon: ({ focused, color }: { focused: boolean; color: string }) => {
      const icon = iconOverride ?? ICONS[name] ?? ICONS.Today
      return <Icon name={focused ? icon.active : icon.inactive} size={22} color={color} />
    },
  }
}

function OfficeTabs() {
  const { t } = useTranslation(), insets = useSafeAreaInsets()
  const requests = useBootstrapStore(state => state.data?.policies.agentPermissions?.attendanceRequests === true)
  return <Tab.Navigator key="own-attendance-tabs" initialRouteName="OwnWorkday" screenOptions={{ headerShown: false, tabBarActiveTintColor: fieldTheme.color.primaryStrong, tabBarInactiveTintColor: fieldTheme.color.inkMuted, tabBarStyle: { minHeight: TAB_BAR_BASE_HEIGHT + Math.max(insets.bottom, 8), paddingBottom: Math.max(insets.bottom, 8) }, tabBarLabelStyle: styles.tabLabel }}>
    <Tab.Screen name="OwnWorkday" component={AttendanceWorkdayScreen} options={tabOptions("OwnWorkday", t("officeAttendance.workday"), { active: "time", inactive: "time-outline" })} />
    {requests && <Tab.Screen name="OwnRequests" component={AttendanceRequestsScreen} options={tabOptions("OwnRequests", t("attendanceRequests.title"), { active: "document-text", inactive: "document-text-outline" })} />}
    <Tab.Screen name="OwnExplanations" component={AttendanceExplanationsScreen} options={tabOptions("OwnExplanations", t("explanations.tab"), { active: "chatbox-ellipses", inactive: "chatbox-ellipses-outline" })} />
    <Tab.Screen name="OwnInbox" component={AttendanceInboxScreen} options={tabOptions("OwnInbox", t("officeAttendance.inbox"), { active: "notifications", inactive: "notifications-outline" })} />
    <Tab.Screen name="OwnProfile" component={ProfileScreen} options={tabOptions("OwnProfile", t("officeAttendance.profile"), { active: "person", inactive: "person-outline" })} />
  </Tab.Navigator>
}

function MainTabs() {
  const { t } = useTranslation()
  const routeFieldAccess = useBootstrapStore((state) => state.routeFieldAccess)
  const bootstrap = useBootstrapStore(state => state.data), agent = useAuthStore(state => state.agent)
  const office = hasOfficeAttendanceAccess(bootstrap, agent)
  const contactsEnabled = useBootstrapStore((state) => fieldContactsEnabled(state.data?.policies))

  // This APK does not infer access from a role. A tenant may enable HRM while
  // Route Field is disabled; only its own manifest module opens tabs, and the
  // manager tabs open only on the server's team grant (mainShell).
  const shell = mainShell({ agent, data: bootstrap, routeFieldAccess, office })
  if (shell.kind === "office") return <OfficeTabs />
  if (shell.kind === "blocked") {
    return <RouteFieldAccessScreen attendance={shell.attendance} access={shell.access} />
  }
  if (shell.kind === "manager") {
    return (
      <ShellTabs navigatorKey={`manager-tabs:${shell.tabs.join(",")}`} initialRouteName="Team">
        {shell.tabs.map((name) => (
          <Tab.Screen
            key={name}
            name={name}
            component={MANAGER_TAB_COMPONENTS[name]}
            options={tabOptions(name, t(MANAGER_TAB_LABEL_KEYS[name]))}
          />
        ))}
      </ShellTabs>
    )
  }

  return (
    <ShellTabs navigatorKey="route-field-tabs" initialRouteName="Today">
      {AGENT_TAB_NAMES.map((name) => (
        <Tab.Screen
          key={name}
          name={name}
          component={TAB_COMPONENTS[name]}
          options={tabOptions(
            name,
            t(name === "Clients" && !contactsEnabled ? "navV2.places" : TAB_LABEL_KEYS[name]),
            name === "Clients" && !contactsEnabled ? { active: "business", inactive: "business-outline" } : undefined,
          )}
        />
      ))}
    </ShellTabs>
  )
}

/**
 * One tab bar for both shells: the same height, rail and captions whether the
 * field agent or his manager holds the phone.
 */
function ShellTabs({ navigatorKey, initialRouteName, children }: {
  navigatorKey: string
  initialRouteName: string
  children: React.ReactNode
}) {
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const rail = shouldUseNavigationRail(width, height)
  const tabBarHeight = TAB_BAR_BASE_HEIGHT + Math.max(insets.bottom, 8)

  return (
    <View style={styles.tabsRoot}>
      <Tab.Navigator
        key={navigatorKey}
        initialRouteName={initialRouteName}
        screenOptions={{
          headerShown: false,
          tabBarPosition: rail ? "left" : "bottom",
          tabBarVariant: rail ? "material" : "uikit",
          tabBarActiveTintColor: fieldTheme.color.primaryStrong,
          tabBarInactiveTintColor: fieldTheme.color.inkMuted,
          // The active tab is said by its green icon and caption, not a
          // filled pill (owner-approved colours, 2026-10-18).
          tabBarLabelPosition: "below-icon",
          tabBarStyle: rail
            ? {
                // One width for the rail. Earlier builds also exposed this on a
                // short landscape phone; 82 dp cut every caption to "B…", "T…".
                // 112 still left "Tapşırı…": the label got 51 dp. 124 gives it
                // 63, and "Tapşırıqlar" needs 59 (measured 2026-09-14).
                // The rail pads itself by the left inset, so a phone turned with
                // its camera cutout on the left lost 45 dp of that and read
                // "Bu …", "Təq…" again (Galaxy S23, same day): add the inset.
                width: RAIL_WIDTH + insets.left,
                backgroundColor: fieldTheme.color.surface,
                borderRightColor: fieldTheme.color.border,
                borderRightWidth: 1,
                borderTopWidth: 0,
                paddingTop: Math.max(insets.top, 12),
                paddingBottom: Math.max(insets.bottom, 12),
                elevation: 0,
              }
            : {
                height: tabBarHeight,
                paddingTop: 7,
                paddingBottom: Math.max(insets.bottom, 8),
                backgroundColor: fieldTheme.color.surface,
                borderTopColor: fieldTheme.color.border,
                borderTopWidth: 1,
                elevation: 10,
                zIndex: 100,
                shadowColor: fieldTheme.color.ink,
                shadowOffset: { width: 0, height: -3 },
                shadowOpacity: 0.08,
                shadowRadius: 8,
              },
          tabBarItemStyle: rail
            ? {
                minHeight: 62,
                marginHorizontal: 8,
                marginVertical: 3,
                borderRadius: fieldTheme.radius.md,
              }
            : { paddingHorizontal: 2 },
          tabBarLabelStyle: styles.tabLabel,
        }}
      >
        {children}
      </Tab.Navigator>
      {/* With the rail the clock sits over the rail's light top, and the battery
          over whatever the screen starts with: white on white on the phone held
          in landscape (2026-09-14). One green band under the whole status bar
          keeps the app-wide light icons readable on every tab; light screens
          leave the icons light in this layout (LightScreenStatusBar). */}
      {rail && insets.top > 0 ? <View pointerEvents="none" style={[styles.railStatusBand, { height: insets.top }]} /> : null}
    </View>
  )
}

export default function AppNavigatorAndroidV2() {
  const {
    isLoggedIn,
    isLoading,
    hasServer,
    serverDomain,
    companyName,
    checkAuth,
    setServer,
    switchServer,
  } = useAuthStore()
  const routeFieldAccess = useBootstrapStore((state) => state.routeFieldAccess)
  const bootstrap = useBootstrapStore(state => state.data), agent = useAuthStore(state => state.agent)
  const routeFieldAdmitted = agent?.role === "AGENT" && hasRouteFieldAccess(routeFieldAccess)
  const office = hasOfficeAttendanceAccess(bootstrap, agent)
  const managerShell = hasManagerShellAccess(bootstrap, agent)
  const ownRequests = bootstrap?.policies.agentPermissions?.attendanceRequests === true

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  if (isLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={fieldTheme.color.primary} />
      </View>
    )
  }

  return (
    <NavigationContainer theme={NAVIGATION_THEME}>
      <Stack.Navigator
        // Recreate the stack when admission changes so a revoked user cannot
        // remain on a previously-mounted detail screen with stale read data.
        key={managerShell
          ? `manager:${agent?.organizationId}:${agent?.id}${office ? ":own-attendance" : ""}`
          : office ? `own-attendance:${agent?.organizationId}:${agent?.id}` : routeFieldAdmitted ? "route-field-admitted" : "route-field-blocked"}
        screenOptions={{ headerShown: false }}
      >
        {isLoggedIn ? (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            {routeFieldAdmitted || managerShell ? <Stack.Screen name="Notifications" component={NotificationsScreen} /> : null}
            {routeFieldAdmitted ? (
              <>
                <Stack.Screen name="OrganizationDetail" component={RouteOrganizationDetailScreen} />
                <Stack.Screen name="ContactDetail" component={RouteContactDetailScreen} />
                <Stack.Screen name="VisitWorkspace" component={VisitWorkspaceScreen} />
                <Stack.Screen name="PresentationViewer" component={PresentationViewerScreen} />
                <Stack.Screen name="DoctorCreateRequest" component={DoctorCreateRequestScreen} />
                <Stack.Screen name="ContactChangeRequest" component={RouteContactChangeRequestScreen} />
                <Stack.Screen name="OrganizationLocationFix" component={RouteOrganizationLocationFixScreen} />
                <Stack.Screen name="TaskDetail" component={TaskDetailScreen} />
                <Stack.Screen name="Visits" component={VisitScreen} />
                <Stack.Screen name="Base" component={RouteBaseScreen} />
                <Stack.Screen name="GpsHistory" component={GpsHistoryScreen} />
                <Stack.Screen name="Profile" component={ProfileScreen} />
                <Stack.Screen name="PlanningBuilder" component={PlanningBuilderScreen} />
              </>
            ) : null}
            {managerShell ? (
              <>
                <Stack.Screen name="PlanningBuilder" component={ManagerPlanningBuilderScreen} />
                <Stack.Screen name="ManagerEmployee" component={ManagerEmployeeScreen} />
                <Stack.Screen name="ManagerTeamMessage" component={ManagerTeamMessageScreen} />
                {/* His own workday tab opens these by name; in the office shell they are tabs. */}
                {office ? (
                  <>
                    {ownRequests ? <Stack.Screen name="OwnRequests" component={AttendanceRequestsScreen} /> : null}
                    <Stack.Screen name="OwnExplanations" component={AttendanceExplanationsScreen} />
                    <Stack.Screen name="OwnInbox" component={AttendanceInboxScreen} />
                    <Stack.Screen name="OwnProfile" component={ProfileScreen} />
                  </>
                ) : null}
              </>
            ) : null}
          </>
        ) : hasServer ? (
          <Stack.Screen name="Login">
            {() => (
              <LoginScreen
                serverDomain={serverDomain}
                companyName={companyName}
                onSwitchServer={switchServer}
              />
            )}
          </Stack.Screen>
        ) : (
          <Stack.Screen name="Server">
            {() => (
              <ServerScreen
                onServerSelected={(domain, name) => setServer(domain, name)}
              />
            )}
          </Stack.Screen>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}

const styles = StyleSheet.create({
  tabsRoot: { flex: 1 },
  railStatusBand: { position: "absolute", top: 0, left: 0, right: 0, backgroundColor: fieldColorScheme === "dark" ? fieldTheme.color.surface : fieldTheme.color.primaryStrong },
  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: fieldTheme.color.canvas,
  },
  tabLabel: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "700",
  },
})
