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
import VisitScreen from "../screens/visit/VisitScreen"
import TasksScreen from "../screens/tasks/TasksScreen"
import ProfileScreen from "../screens/profile/ProfileScreen"
import DashboardScreen from "../screens/dashboard/DashboardScreen"

// Route type map for useNavigation<NativeStackNavigationProp<RootStackParamList>>
export type RootStackParamList = {
  Main: undefined
  Login: undefined
  Server: undefined
}

const Stack = createNativeStackNavigator<RootStackParamList>()
const Tab = createBottomTabNavigator()

const TAB_ICONS: Record<string, { active: string; inactive: string }> = {
  Route: { active: "navigate", inactive: "navigate-outline" },
  Visit: { active: "checkmark-circle", inactive: "checkmark-circle-outline" },
  Tasks: { active: "clipboard", inactive: "clipboard-outline" },
  Dashboard: { active: "bar-chart", inactive: "bar-chart-outline" },
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
      <Tab.Screen name="Visit" component={VisitScreen} />
      <Tab.Screen name="Tasks" component={TasksScreen} />
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
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
