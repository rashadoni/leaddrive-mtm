import React, { useEffect } from "react"
import { ActivityIndicator, View } from "react-native"
import { NavigationContainer } from "@react-navigation/native"
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Icon from "react-native-vector-icons/Ionicons"
import { useAuthStore } from "../store/auth"

import ServerScreen from "../screens/server/ServerScreen"
import LoginScreen from "../screens/auth/LoginScreen"
import RouteScreen from "../screens/route/RouteScreen"
import WeekScreen from "../screens/week/WeekScreen"
import VisitScreen from "../screens/visit/VisitScreen"
import TasksScreen from "../screens/tasks/TasksScreen"
import BaseScreen from "../screens/base/BaseScreen"
import OrganizationDetailScreen from "../screens/base/OrganizationDetailScreen"
import ContactDetailScreen from "../screens/base/ContactDetailScreen"
import VisitWorkspaceScreen from "../screens/visit/VisitWorkspaceScreen"
import ProfileScreen from "../screens/profile/ProfileScreen"
import DashboardScreen from "../screens/dashboard/DashboardScreen"

// Route type map for useNavigation<NativeStackNavigationProp<RootStackParamList>>
export type RootStackParamList = {
  Main: undefined
  Login: undefined
  Server: undefined
  OrganizationDetail: { id: string; name?: string }
  ContactDetail: { id: string; name?: string }
  VisitWorkspace: { visitId: string; name?: string }
}

const Stack = createNativeStackNavigator<RootStackParamList>()
const Tab = createBottomTabNavigator()

const TAB_ICONS: Record<string, { active: string; inactive: string }> = {
  Route: { active: "navigate", inactive: "navigate-outline" },
  Week: { active: "calendar-number", inactive: "calendar-number-outline" },
  Visit: { active: "checkmark-circle", inactive: "checkmark-circle-outline" },
  Tasks: { active: "clipboard", inactive: "clipboard-outline" },
  Dashboard: { active: "bar-chart", inactive: "bar-chart-outline" },
  Base: { active: "business", inactive: "business-outline" },
  Profile: { active: "person", inactive: "person-outline" },
}

function MainTabs() {
  const insets = useSafeAreaInsets()
  const tabBarHeight = 60 + Math.max(insets.bottom, 8)

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: "#6C63FF",
        tabBarInactiveTintColor: "#94a3b8",
        tabBarIcon: ({ focused, color, size: _size }) => {
          const icons = TAB_ICONS[route.name] || TAB_ICONS.Route
          return <Icon name={focused ? icons.active : icons.inactive} size={22} color={color} />
        },
        tabBarStyle: {
          backgroundColor: "#fff",
          borderTopColor: "#f1f5f9",
          borderTopWidth: 1,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 8,
          height: tabBarHeight,
          elevation: 12,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600", letterSpacing: 0.2 },
      })}
    >
      <Tab.Screen name="Route" component={RouteScreen} />
      <Tab.Screen name="Week" component={WeekScreen} />
      <Tab.Screen name="Visit" component={VisitScreen} />
      <Tab.Screen name="Tasks" component={TasksScreen} />
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Base" component={BaseScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  )
}

export default function AppNavigator() {
  const { isLoggedIn, isLoading, hasServer, serverDomain, companyName, checkAuth, setServer, switchServer } = useAuthStore()

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F4F5F9" }}>
        <ActivityIndicator size="large" color="#6C63FF" />
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
