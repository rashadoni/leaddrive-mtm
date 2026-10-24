import React from "react"
import { act, create, type ReactTestRenderer } from "react-test-renderer"

jest.mock("@react-navigation/native", () => ({
  NavigationContainer: ({ children }: { children: React.ReactNode }) => children,
  DarkTheme: {}, DefaultTheme: {},
}))
jest.mock("@react-navigation/native-stack", () => {
  const mockReact = require("react")
  // A mounted stack screen can be cached while its parent navigator updates.
  const Screen = mockReact.memo(({ component: Component }: { component: React.ComponentType }) => <Component />)
  return { createNativeStackNavigator: () => ({
    Navigator: ({ children }: { children: React.ReactNode }) => children,
    Screen,
  }) }
})
jest.mock("@react-navigation/bottom-tabs", () => {
  const mockReact = require("react")
  return { createBottomTabNavigator: () => ({
  Navigator: ({ children, screenOptions }: { children: React.ReactNode; screenOptions: unknown }) =>
    mockReact.createElement("TabBar", { testID: "tab-bar", screenOptions }, mockReact.Children.toArray(children)[1]),
  Screen: ({ component: Component }: { component: React.ComponentType }) => <Component />,
}) }
})
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock("react-native-vector-icons/Ionicons", () => "Icon")
jest.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
jest.mock("../../src/store/auth", () => ({ useAuthStore: require("zustand").create(() => ({})) }))
jest.mock("../../src/store/bootstrap", () => ({ useBootstrapStore: require("zustand").create(() => ({})) }))
jest.mock("../../src/screens/server/ServerScreen", () => () => null)
jest.mock("../../src/screens/auth/LoginScreen", () => () => null)
jest.mock("../../src/screens/profile/ProfileScreen", () => () => null)
jest.mock("../../src/screens/auth/RouteFieldAccessScreen.android", () => () => null)
jest.mock("../../src/screens/attendance/AttendanceWorkdayScreen", () => () => null)
jest.mock("../../src/screens/attendance/AttendanceRequestsScreen", () => {
  const mockReact = require("react"), { TextInput } = require("react-native")
  return function RequestDraft() {
    const [value, onChangeText] = mockReact.useState("")
    return <TextInput testID="request-draft" value={value} onChangeText={onChangeText} />
  }
})
jest.mock("../../src/screens/attendance/AttendanceExplanationsScreen", () => () => null)
jest.mock("../../src/screens/attendance/AttendanceInboxScreen", () => () => null)

import AttendanceNavigator from "../../src/attendance/AttendanceNavigator"
import { useAuthStore } from "../../src/store/auth"
import { useBootstrapStore } from "../../src/store/bootstrap"
import { setFieldColorScheme } from "../../src/theme/fieldTheme"
import { TIME_PALETTES } from "../../src/attendance/ui/TimeUI"
import { officeAgent, officeBootstrap } from "../../test-support/office-attendance"

let tree: ReactTestRenderer | undefined
beforeEach(() => {
  setFieldColorScheme("light")
  useAuthStore.setState({ isLoading: false, isLoggedIn: true, agent: officeAgent as never })
  const data = officeBootstrap()
  useBootstrapStore.setState({ data, routeFieldAccess: data.routeFieldAccess })
})
afterEach(async () => { await act(async () => { tree?.unmount(); tree = undefined; setFieldColorScheme("light") }) })

it("updates a cached tab bar in both directions without replacing the open request draft", async () => {
  await act(async () => { tree = create(<AttendanceNavigator />) })
  const bar = () => tree!.root.findByProps({ testID: "tab-bar" }).props.screenOptions
  const draft = () => tree!.root.findByProps({ testID: "request-draft" })
  await act(async () => { draft().props.onChangeText("My unfinished request") })
  for (const scheme of ["dark", "light"] as const) {
    await act(async () => { setFieldColorScheme(scheme) })
    expect(bar().tabBarStyle.backgroundColor).toBe(TIME_PALETTES[scheme].surface)
    expect(bar().tabBarActiveTintColor).toBe(TIME_PALETTES[scheme].accent)
    expect(bar().tabBarInactiveTintColor).toBe(TIME_PALETTES[scheme].muted)
    expect(draft().props.value).toBe("My unfinished request")
  }
})
