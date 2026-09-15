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
import { hasRouteFieldAccess } from "../services/bootstrap"
import { fieldTheme } from "../theme/fieldTheme"
import { isTabletWidth, NAV_RAIL_WIDTH } from "../theme/layoutBreakpoints"

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
import GpsHistoryScreen from "../screens/gps/GpsHistoryScreen"
import ProfileScreen from "../screens/profile/ProfileScreen"
import MoreScreen from "../screens/more/MoreScreen"
import TodayScreen from "../screens/today/TodayScreen"
import RouteSelfPlanningWorkspace from "../screens/route/RouteSelfPlanningWorkspace.android"
import RouteFieldAccessScreen from "../screens/auth/RouteFieldAccessScreen.android"
import type { RawTask } from "../services/task-detail"
import { AGENT_TAB_NAMES } from "./role-tabs"

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
  /** Type-only legacy entry keeps an unmounted manager source file type-safe;
   * it is not registered in the Route Field navigator. */
  ContactTransfer: undefined
  /** Route Field planning is self-only; team planning remains in the legacy shell. */
  PlanningBuilder: { initialDate?: string; initialHorizon?: 1 | 7; editPublished?: boolean } | undefined
}

const Stack = createNativeStackNavigator<RootStackParamList>()
const Tab = createBottomTabNavigator()

const ICONS: Record<string, { active: string; inactive: string }> = {
  Today: { active: "today", inactive: "today-outline" },
  Calendar: { active: "calendar-number", inactive: "calendar-number-outline" },
  Route: { active: "navigate", inactive: "navigate-outline" },
  Tasks: { active: "checkbox", inactive: "checkbox-outline" },
  More: { active: "ellipsis-horizontal-circle", inactive: "ellipsis-horizontal-circle-outline" },
}

const PlanningBuilderScreen = ({
  navigation,
  route,
}: {
  navigation: { goBack: () => void }
  route: { params?: { initialDate?: string; initialHorizon?: 1 | 7; editPublished?: boolean } }
}) => (
  <RouteSelfPlanningWorkspace
    onClose={() => navigation.goBack()}
    initialDate={route.params?.initialDate}
    initialHorizon={route.params?.initialHorizon}
    editPublished={route.params?.editPublished}
  />
)

type RouteFieldTabName = typeof AGENT_TAB_NAMES[number]

const TAB_COMPONENTS: Record<RouteFieldTabName, React.ComponentType<any>> = {
  Today: TodayScreen,
  Calendar: WeekScreen,
  Route: RouteScreen,
  Tasks: TasksScreen,
  More: MoreScreen,
}

const TAB_LABEL_KEYS: Record<RouteFieldTabName, string> = {
  Today: "navV2.today",
  Calendar: "navV2.calendar",
  Route: "navV2.route",
  Tasks: "navV2.tasks",
  More: "navV2.more",
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
  const routeFieldAccess = useBootstrapStore((state) => state.routeFieldAccess)
  const tablet = isTabletWidth(width)
  const tabBarHeight = TAB_BAR_BASE_HEIGHT + Math.max(insets.bottom, 8)

  // This APK does not infer access from an agent role. A tenant may enable
  // HRM while Route Field is disabled; only its own manifest module opens tabs.
  if (!hasRouteFieldAccess(routeFieldAccess)) {
    return <RouteFieldAccessScreen access={routeFieldAccess} />
  }

  return (
    <View style={styles.tabsRoot}>
      <Tab.Navigator
        key="route-field-tabs"
        initialRouteName="Today"
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
                // One width for the rail. At 82 dp a phone held in landscape (823 dp,
                // below the 840 "expanded" line) cut every caption to "B…", "T…".
                // 112 still left "Tapşırı…": the label got 51 dp on the phone. 124
                // gives it 63, and "Tapşırıqlar" needs 59 (measured 2026-09-14).
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
            : { paddingHorizontal: 2 },
          tabBarLabelStyle: styles.tabLabel,
        }}
      >
        {AGENT_TAB_NAMES.map((name) => (
          <Tab.Screen
            key={name}
            name={name}
            component={TAB_COMPONENTS[name]}
            options={tabOptions(name, t(TAB_LABEL_KEYS[name]))}
          />
        ))}
      </Tab.Navigator>
      {/* With the rail the clock sits over the rail's light top, and the battery
          over whatever the screen starts with: white on white on the phone held
          in landscape (2026-09-14). One green band under the whole status bar
          keeps the app-wide light icons readable on every tab; light screens
          leave the icons light in this layout (LightScreenStatusBar). */}
      {tablet && insets.top > 0 ? <View pointerEvents="none" style={[styles.railStatusBand, { height: insets.top }]} /> : null}
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
  const routeFieldAdmitted = hasRouteFieldAccess(routeFieldAccess)

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
      <Stack.Navigator
        // Recreate the stack when admission changes so a revoked user cannot
        // remain on a previously-mounted detail screen with stale read data.
        key={routeFieldAdmitted ? "route-field-admitted" : "route-field-blocked"}
        screenOptions={{ headerShown: false }}
      >
        {isLoggedIn ? (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            {routeFieldAdmitted ? (
              <>
                <Stack.Screen name="OrganizationDetail" component={RouteOrganizationDetailScreen} />
                <Stack.Screen name="ContactDetail" component={RouteContactDetailScreen} />
                <Stack.Screen name="VisitWorkspace" component={VisitWorkspaceScreen} />
                <Stack.Screen name="TaskDetail" component={TaskDetailScreen} />
                <Stack.Screen name="Visits" component={VisitScreen} />
                <Stack.Screen name="Base" component={RouteBaseScreen} />
                <Stack.Screen name="GpsHistory" component={GpsHistoryScreen} />
                <Stack.Screen name="Profile" component={ProfileScreen} />
                <Stack.Screen name="PlanningBuilder" component={PlanningBuilderScreen} />
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
  railStatusBand: { position: "absolute", top: 0, left: 0, right: 0, backgroundColor: fieldTheme.color.primaryStrong },
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
