import React from "react"
import { act, create, type ReactTestRenderer } from "react-test-renderer"

jest.mock("@react-navigation/native", () => ({
  NavigationContainer: ({ children }: { children: React.ReactNode }) => children,
  DarkTheme: {}, DefaultTheme: {},
}))
jest.mock("@react-navigation/native-stack", () => ({ createNativeStackNavigator: () => ({
  Navigator: ({ children }: { children: React.ReactNode }) => children,
  Screen: ({ component: Component, children }: { component?: React.ComponentType; children?: () => React.ReactNode }) => Component ? <Component /> : children?.(),
}) }))
jest.mock("@react-navigation/bottom-tabs", () => ({ createBottomTabNavigator: () => ({}) }))
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock("react-native-vector-icons/Ionicons", () => "Icon")
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
jest.mock("../../src/store/auth", () => ({ useAuthStore: require("zustand").create(() => ({})) }))
jest.mock("../../src/store/bootstrap", () => ({ useBootstrapStore: require("zustand").create(() => ({})) }))
jest.mock("../../src/services/connection-health", () => ({ redial: jest.fn() }))
jest.mock("../../src/screens/server/ServerScreen", () => () => null)
jest.mock("../../src/screens/auth/LoginScreen", () => () => null)
jest.mock("../../src/screens/profile/ProfileScreen", () => () => null)
jest.mock("../../src/screens/attendance/AttendanceWorkdayScreen", () => () => null)
jest.mock("../../src/screens/attendance/AttendanceRequestsScreen", () => () => null)
jest.mock("../../src/screens/attendance/AttendanceExplanationsScreen", () => () => null)
jest.mock("../../src/screens/attendance/AttendanceInboxScreen", () => () => null)

import AttendanceNavigator from "../../src/attendance/AttendanceNavigator"
import { useAuthStore } from "../../src/store/auth"
import { useBootstrapStore } from "../../src/store/bootstrap"
import { officeAgent } from "../../test-support/office-attendance"

let tree: ReactTestRenderer | undefined
const fetchBootstrap = jest.fn(async () => "disabled" as const)
beforeEach(() => {
  jest.clearAllMocks()
  useAuthStore.setState({ isLoading: false, isLoggedIn: true, agent: officeAgent as never, logout: async () => {} })
  useBootstrapStore.setState({ data: null, routeFieldAccess: "pending", fetchBootstrap })
})
afterEach(async () => { await act(async () => { tree?.unmount(); tree = undefined }) })
const retryButtons = () => tree!.root.findAll(node => node.props.accessibilityLabel === "routeFieldAccess.refresh")

it.each(["disabled", "unavailable"] as const)("offers retry after a %s response with no bootstrap instead of checking forever", async routeFieldAccess => {
  await act(async () => { tree = create(<AttendanceNavigator />) })
  expect(retryButtons()).toHaveLength(0)
  await act(async () => { useBootstrapStore.setState({ data: null, routeFieldAccess }) })
  expect(retryButtons().length).toBeGreaterThan(0)
  await act(async () => { retryButtons()[0].props.onPress() })
  expect(fetchBootstrap).toHaveBeenCalledTimes(1)
})
