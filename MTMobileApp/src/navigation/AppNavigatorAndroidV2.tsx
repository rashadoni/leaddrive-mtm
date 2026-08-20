import React, { useEffect } from "react"
import { ActivityIndicator, StyleSheet, useWindowDimensions, View } from "react-native"
import { NavigationContainer } from "@react-navigation/native"
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import { useAuthStore } from "../store/auth"
import { useBootstrapStore } from "../store/bootstrap"
import { navGroupFromCapabilities, type NavGroup } from "../services/bootstrap"
import { isManagerRole, normalizeRole } from "../auth/roles"
import { fieldTheme } from "../theme/fieldTheme"
import { isExpandedTabletWidth, isTabletWidth } from "../theme/layoutBreakpoints"

import ServerScreen from "../screens/server/ServerScreen"
import LoginScreen from "../screens/auth/LoginScreen"
import RouteScreen from "../screens/route/RouteScreen"
import WeekScreen from "../screens/week/WeekScreen"
import VisitScreen from "../screens/visit/VisitScreen"
import TasksScreen from "../screens/tasks/TasksScreen"
import TaskDetailScreen from "../screens/tasks/TaskDetailScreen"
import BaseScreen from "../screens/base/BaseScreen"
import OrganizationDetailScreen from "../screens/base/OrganizationDetailScreen"
import ContactDetailScreen from "../screens/base/ContactDetailScreen"
import VisitWorkspaceScreen from "../screens/visit/VisitWorkspaceScreen"
import GpsHistoryScreen from "../screens/gps/GpsHistoryScreen"
import ProfileScreen from "../screens/profile/ProfileScreen"
import MoreScreen from "../screens/more/MoreScreen"
import DashboardScreen from "../screens/dashboard/DashboardScreen.android"
import ManagerWorkspaceScreen from "../screens/manager/ManagerWorkspaceScreen.android"
import ContactTransferScreen from "../screens/manager/ContactTransferScreen.android"
import UnsupportedRoleScreen from "../screens/auth/UnsupportedRoleScreen.android"
import type { RawTask } from "../services/task-detail"
import { tabNamesForNavGroup, type AppTabName } from "./role-tabs"

export type RootStackParamList = {
  Main: undefined
  Login: undefined
  Server: undefined
  OrganizationDetail: { id: string; name?: string }
  ContactDetail: { id: string; name?: string }
  VisitWorkspace: { visitId: string; name?: string }
  TaskDetail: { task: RawTask }
  Visits: undefined
  Base: undefined
  GpsHistory: undefined
  Profile: undefined
  ContactTransfer: undefined
}

const Stack = createNativeStackNavigator<RootStackParamList>()
const Tab = createBottomTabNavigator()

const ICONS: Record<string, { active: string; inactive: string }> = {
  Today: { active: "today", inactive: "today-outline" },
  Calendar: { active: "calendar-number", inactive: "calendar-number-outline" },
  Route: { active: "navigate", inactive: "navigate-outline" },
  Tasks: { active: "checkbox", inactive: "checkbox-outline" },
  More: { active: "ellipsis-horizontal-circle", inactive: "ellipsis-horizontal-circle-outline" },
  Overview: { active: "grid", inactive: "grid-outline" },
  Team: { active: "people", inactive: "people-outline" },
  Planning: { active: "calendar", inactive: "calendar-outline" },
  Approvals: { active: "shield-checkmark", inactive: "shield-checkmark-outline" },
}

const TeamScreen = () => <ManagerWorkspaceScreen kind="team" />
const PlanningScreen = () => <ManagerWorkspaceScreen kind="planning" />
const ApprovalsScreen = () => <ManagerWorkspaceScreen kind="approvals" />

const TAB_COMPONENTS: Record<AppTabName, React.ComponentType<any>> = {
  Today: DashboardScreen,
  Calendar: WeekScreen,
  Route: RouteScreen,
  Tasks: TasksScreen,
  More: MoreScreen,
  Overview: DashboardScreen,
  Team: TeamScreen,
  Planning: PlanningScreen,
  Approvals: ApprovalsScreen,
}

const TAB_LABEL_KEYS: Record<AppTabName, string> = {
  Today: "navV2.today",
  Calendar: "navV2.calendar",
  Route: "navV2.route",
  Tasks: "navV2.tasks",
  More: "navV2.more",
  Overview: "navV2.overview",
  Team: "navV2.team",
  Planning: "navV2.planning",
  Approvals: "navV2.approvals",
}

function tabOptions(name: string, label: string) {
  return {
    title: label,
    tabBarIcon: ({ focused, color }: { focused: boolean; color: string }) => {
      const icon = ICONS[name] ?? ICONS.Today
      return <Icon name={focused ? icon.active : icon.inactive} size={22} color={color} />
    },
  }
}

function MainTabs() {
  const { t } = useTranslation()
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const role = useAuthStore((state) => state.agent?.role)
  const capabilities = useBootstrapStore((state) => state.capabilities)
  const normalizedRole = normalizeRole(role)
  // Server capabilities (from /mobile/bootstrap) are authoritative once loaded;
  // until then — or if bootstrap failed/offline — fall back to the role-derived
  // group so the shell never blocks on the network.
  const navGroup: NavGroup = capabilities.length > 0
    ? navGroupFromCapabilities(capabilities)
    : normalizedRole === "UNKNOWN"
      ? "none"
      : isManagerRole(role)
        ? "team"
        : "field"
  const manager = navGroup === "team"
  const tablet = isTabletWidth(width)
  const expandedRail = isExpandedTabletWidth(width)
  const tabBarHeight = 60 + Math.max(insets.bottom, 8)

  if (navGroup === "none") return <UnsupportedRoleScreen />

  return (
    <Tab.Navigator
      key={manager ? "manager-tabs" : "agent-tabs"}
      initialRouteName={manager ? "Overview" : "Today"}
      screenOptions={{
        headerShown: false,
        tabBarPosition: tablet ? "left" : "bottom",
        tabBarVariant: tablet ? "material" : "uikit",
        tabBarActiveTintColor: fieldTheme.color.primaryStrong,
        tabBarInactiveTintColor: fieldTheme.color.inkMuted,
        tabBarActiveBackgroundColor: fieldTheme.color.primarySoft,
        tabBarLabelPosition: "below-icon",
        tabBarStyle: tablet
          ? {
              width: expandedRail ? 112 : 82,
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
              shadowColor: fieldTheme.color.ink,
              shadowOffset: { width: 0, height: -3 },
              shadowOpacity: 0.08,
              shadowRadius: 8,
            },
        tabBarItemStyle: tablet
          ? {
              minHeight: 62,
              marginHorizontal: 8,
              marginVertical: 3,
              borderRadius: fieldTheme.radius.md,
            }
          : undefined,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      {tabNamesForNavGroup(manager ? "team" : "field").map((name) => (
        <Tab.Screen
          key={name}
          name={name}
          component={TAB_COMPONENTS[name]}
          options={tabOptions(name, t(TAB_LABEL_KEYS[name]))}
        />
      ))}
    </Tab.Navigator>
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
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isLoggedIn ? (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="OrganizationDetail" component={OrganizationDetailScreen} />
            <Stack.Screen name="ContactDetail" component={ContactDetailScreen} />
            <Stack.Screen name="VisitWorkspace" component={VisitWorkspaceScreen} />
            <Stack.Screen name="TaskDetail" component={TaskDetailScreen} />
            <Stack.Screen name="Visits" component={VisitScreen} />
            <Stack.Screen name="Base" component={BaseScreen} />
            <Stack.Screen name="GpsHistory" component={GpsHistoryScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="ContactTransfer" component={ContactTransferScreen} />
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
  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: fieldTheme.color.canvas,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
})
