import { TimeText as Text } from "./ui/TimeText"
import React, { useEffect, useState } from "react"
import { ActivityIndicator, AppState, StyleSheet, useWindowDimensions, View } from "react-native"
import { DarkTheme, DefaultTheme, NavigationContainer, createNavigationContainerRef } from "@react-navigation/native"
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs"
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useTranslation } from "react-i18next"
import Icon from "react-native-vector-icons/Ionicons"
import { useAuthStore } from "../store/auth"
import { useBootstrapStore } from "../store/bootstrap"
import { fieldTheme, themed, useFieldColorScheme, withFieldColorScheme } from "../theme/fieldTheme"
import { TAB_BAR_BASE_HEIGHT } from "../theme/tabBarMetrics"
import ServerScreen from "../screens/server/ServerScreen"
import LoginScreen from "../screens/auth/LoginScreen"
import RouteFieldAccessScreen from "../screens/auth/RouteFieldAccessScreen.android"
import AttendanceWorkdayScreen from "../screens/attendance/AttendanceWorkdayScreen"
import AttendanceRequestsScreen from "../screens/attendance/AttendanceRequestsScreen"
import AttendanceExplanationsScreen from "../screens/attendance/AttendanceExplanationsScreen"
import AttendanceInboxScreen from "../screens/attendance/AttendanceInboxScreen"
import ProfileScreen from "../screens/profile/ProfileScreen"
import { TimePresentation, timeColor } from "./ui/TimeUI"
import { ATTENDANCE_APP, attendanceTabs } from "./profile"
import { consumeOpenedPushTarget, timeRouteForPushTarget } from "./push-open"

const Tab = createBottomTabNavigator(), Stack = createNativeStackNavigator()
const CompactWorkday = () => <AttendanceWorkdayScreen compact />
const OwnProfile = () => <ProfileScreen versionLabel={`${ATTENDANCE_APP.displayName} v${ATTENDANCE_APP.version}`} />
const screens: Record<string, { component: React.ComponentType<any>; label: string; icon: string }> = {
  OwnWorkday: { component: withFieldColorScheme(CompactWorkday), label: "officeAttendance.workday", icon: "time-outline" },
  OwnRequests: { component: withFieldColorScheme(AttendanceRequestsScreen), label: "attendanceRequests.title", icon: "document-text-outline" },
  OwnExplanations: { component: withFieldColorScheme(AttendanceExplanationsScreen), label: "explanations.tab", icon: "chatbox-ellipses-outline" },
  OwnInbox: { component: withFieldColorScheme(AttendanceInboxScreen), label: "officeAttendance.inbox", icon: "notifications-outline" },
  OwnProfile: { component: withFieldColorScheme(OwnProfile), label: "officeAttendance.profile", icon: "person-outline" },
}
const tabLabels: Record<string, string> = { OwnWorkday: "day", OwnRequests: "requests", OwnExplanations: "explanations", OwnInbox: "inbox", OwnProfile: "profile" }
function OwnTabs() {
  // Stack screens can be cached independently of AttendanceNavigator.
  useFieldColorScheme()
  const { t } = useTranslation(), insets = useSafeAreaInsets()
  const { fontScale } = useWindowDimensions()
  const tabHeight = Math.max(TAB_BAR_BASE_HEIGHT, Math.ceil(30 * Math.max(1, fontScale)) + 30)
  const agent = useAuthStore(state => state.agent)
  const { data, routeFieldAccess } = useBootstrapStore()
  const tabs = attendanceTabs(data, agent)
  if (!tabs.length) return <RouteFieldAccessScreen attendance access={routeFieldAccess === "offline" ? "offline" : routeFieldAccess === "pending" ? "pending" : "disabled"} />
  return <Tab.Navigator initialRouteName="OwnWorkday" screenOptions={{
    headerShown: false,
    tabBarActiveTintColor: timeColor.accent,
    tabBarInactiveTintColor: timeColor.muted,
    tabBarStyle: { backgroundColor: timeColor.surface, borderTopColor: timeColor.line, paddingTop: 8, minHeight: tabHeight + Math.max(insets.bottom, 8), paddingBottom: Math.max(insets.bottom, 8) },
    tabBarLabelPosition: "below-icon",
  }}>
    {tabs.map(name => <Tab.Screen key={name} name={name} component={screens[name].component} options={{
      title: t(screens[name].label), tabBarButtonTestID: `time-tab-${name}`, tabBarAccessibilityLabel: t(screens[name].label),
      tabBarLabel: ({ color }) => <Text numberOfLines={2} style={[styles.tabLabel, { color }]}>{t(`attendanceCompact.tabs.${tabLabels[name]}`)}</Text>,
      tabBarIcon: ({ color }) => <Icon name={screens[name].icon} size={22} color={color} />,
    }} />)}
  </Tab.Navigator>
}
const navigation = createNavigationContainerRef<Record<string, object | undefined>>()

export default function AttendanceNavigator() {
  const auth = useAuthStore(), data = useBootstrapStore(state => state.data)
  const scheme = useFieldColorScheme()
  const [navigationReady, setNavigationReady] = useState(false)
  const tabs = attendanceTabs(data, auth.agent)
  // A tapped notification opens its screen: at start and on every return to the foreground.
  useEffect(() => {
    if (!navigationReady || !auth.isLoggedIn || !tabs.length) return
    let mounted = true
    const open = () => { void consumeOpenedPushTarget().then(target => {
      const route = timeRouteForPushTarget(target)
      if (mounted && route && tabs.includes(route) && navigation.isReady()) navigation.navigate("Main", { screen: route })
    }) }
    open()
    const lifecycle = AppState.addEventListener("change", next => { if (next === "active") open() })
    return () => { mounted = false; lifecycle.remove() }
  }, [navigationReady, auth.isLoggedIn, tabs.join(",")])
  if (auth.isLoading) return <View style={styles.loading}><ActivityIndicator /></View>
  const admitted = tabs.length > 0
  return <TimePresentation.Provider value><NavigationContainer ref={navigation} onReady={() => setNavigationReady(true)} theme={scheme === "dark" ? DarkTheme : DefaultTheme}>
    <Stack.Navigator key={`${auth.agent?.organizationId ?? ""}:${auth.agent?.id ?? ""}:${admitted}`} screenOptions={{ headerShown: false }}>
      {auth.isLoggedIn ? <Stack.Screen name="Main" component={OwnTabs} /> : auth.hasServer ?
        <Stack.Screen name="Login">{() => <LoginScreen productName={ATTENDANCE_APP.displayName} serverDomain={auth.serverDomain} companyName={auth.companyName} onSwitchServer={auth.switchServer} />}</Stack.Screen> :
        <Stack.Screen name="Server">{() => <ServerScreen productName={ATTENDANCE_APP.displayName} onServerSelected={auth.setServer} />}</Stack.Screen>}
    </Stack.Navigator>
  </NavigationContainer></TimePresentation.Provider>
}
const styles = themed(() => StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: fieldTheme.color.canvas },
  tabLabel: { fontSize: 11, lineHeight: 15, fontWeight: "600", textAlign: "center", alignSelf: "stretch" },
}))
