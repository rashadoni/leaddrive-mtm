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
import DashboardScreen from "../screens/dashboard/DashboardScreen.android"
import ManagerWorkspaceScreen from "../screens/manager/ManagerWorkspaceScreen.android"
import UnsupportedRoleScreen from "../screens/auth/UnsupportedRoleScreen.android"
import type { RawTask } from "../services/task-detail"

export type RootStackParamList = {
  Main: undefined
  Login: undefined
  Server: undefined
  OrganizationDetail: { id: string; name?: string }
  ContactDetail: { id: string; name?: string }
  VisitWorkspace: { visitId: string; name?: string }
  TaskDetail: { task: RawTask }
  GpsHistory: undefined
}

const Stack = createNativeStackNavigator<RootStackParamList>()
const Tab = createBottomTabNavigator()

const ICONS: Record<string, { active: string; inactive: string }> = {
  Home: { active: "home", inactive: "home-outline" },
  Week: { active: "calendar-number", inactive: "calendar-number-outline" },
  Route: { active: "navigate", inactive: "navigate-outline" },
  Visits: { active: "checkmark-circle", inactive: "checkmark-circle-outline" },
  Tasks: { active: "checkbox", inactive: "checkbox-outline" },
  Base: { active: "business", inactive: "business-outline" },
  Profile: { active: "person", inactive: "person-outline" },
  Overview: { active: "grid", inactive: "grid-outline" },
  Team: { active: "people", inactive: "people-outline" },
  Planning: { active: "calendar", inactive: "calendar-outline" },
  Approvals: { active: "shield-checkmark", inactive: "shield-checkmark-outline" },
}

const TeamScreen = () => <ManagerWorkspaceScreen kind="team" />
const PlanningScreen = () => <ManagerWorkspaceScreen kind="planning" />
const ApprovalsScreen = () => <ManagerWorkspaceScreen kind="approvals" />

function tabOptions(name: string, label: string) {
  return {
    title: label,
    tabBarIcon: ({ focused, color }: { focused: boolean; color: string }) => {
      const icon = ICONS[name] ?? ICONS.Home
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
      initialRouteName={manager ? "Overview" : "Home"}
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
      {manager ? (
        <>
          <Tab.Screen name="Overview" component={DashboardScreen} options={tabOptions("Overview", t("navV2.overview"))} />
          <Tab.Screen name="Team" component={TeamScreen} options={tabOptions("Team", t("navV2.team"))} />
          <Tab.Screen name="Planning" component={PlanningScreen} options={tabOptions("Planning", t("navV2.planning"))} />
          <Tab.Screen name="Approvals" component={ApprovalsScreen} options={tabOptions("Approvals", t("navV2.approvals"))} />
          <Tab.Screen name="Profile" component={ProfileScreen} options={tabOptions("Profile", t("navV2.profile"))} />
        </>
      ) : (
        <>
          <Tab.Screen name="Home" component={DashboardScreen} options={tabOptions("Home", t("navV2.home"))} />
          <Tab.Screen name="Week" component={WeekScreen} options={tabOptions("Week", t("navV2.week"))} />
          <Tab.Screen name="Route" component={RouteScreen} options={tabOptions("Route", t("navV2.route"))} />
          <Tab.Screen name="Visits" component={VisitScreen} options={tabOptions("Visits", t("navV2.visits"))} />
          <Tab.Screen name="Tasks" component={TasksScreen} options={tabOptions("Tasks", t("navV2.tasks"))} />
          <Tab.Screen name="Base" component={BaseScreen} options={tabOptions("Base", t("navV2.base"))} />
          <Tab.Screen name="Profile" component={ProfileScreen} options={tabOptions("Profile", t("navV2.profile"))} />
        </>
      )}
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
            <Stack.Screen name="GpsHistory" component={GpsHistoryScreen} />
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
