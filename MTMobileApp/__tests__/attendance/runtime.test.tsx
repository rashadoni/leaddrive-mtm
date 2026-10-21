import React from "react"
import { act, create, type ReactTestRenderer } from "react-test-renderer"
import { AppState, PermissionsAndroid } from "react-native"
import NetInfo from "@react-native-community/netinfo"
import Geolocation from "@react-native-community/geolocation"

jest.mock("react-native", () => ({
  AppState: { addEventListener: jest.fn() },
  PermissionsAndroid: { request: jest.fn(), requestMultiple: jest.fn() },
  View: "View", ActivityIndicator: "ActivityIndicator", StatusBar: "StatusBar",
}))
jest.mock("react-native-safe-area-context", () => ({ SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children }))
jest.mock("@react-native-community/netinfo", () => ({ addEventListener: jest.fn() }))
jest.mock("@react-native-community/geolocation", () => ({ setRNConfiguration: jest.fn(), getCurrentPosition: jest.fn() }))
jest.mock("../../src/attendance/AttendanceNavigator", () => () => null)
jest.mock("../../src/components/ErrorBoundary", () => ({ ErrorBoundary: ({ children }: { children: React.ReactNode }) => children }))
jest.mock("../../src/components/AppFeedbackHost", () => () => null)
jest.mock("../../src/store/auth", () => ({ useAuthStore: require("zustand").create(() => ({})) }))
jest.mock("../../src/store/bootstrap", () => ({ useBootstrapStore: require("zustand").create(() => ({ data: null })) }))
jest.mock("../../src/store/hints", () => ({ useHintsStore: { getState: () => ({ hydrate: async () => {} }) } }))
jest.mock("../../src/store/sync-status", () => ({ useSyncStatusStore: { getState: () => ({ setOnline: jest.fn() }) } }))
jest.mock("../../src/services/api", () => ({ api: { setUnauthorizedHandler: jest.fn() } }))
jest.mock("../../src/services/attendance-session", () => ({ refreshAttendanceSession: jest.fn(async () => true) }))
jest.mock("../../src/services/foreground-sync-retry", () => ({ startForegroundSyncRetry: jest.fn() }))
jest.mock("../../src/services/follow-phone-color-scheme", () => ({ followPhoneColorScheme: jest.fn(() => () => {}) }))
jest.mock("../../src/services/app-feedback", () => ({ dismissAllChoices: jest.fn() }))
jest.mock("../../src/i18n/index.android", () => ({ initI18n: jest.fn(async () => {}) }))
jest.mock("../../src/theme/fieldTheme", () => ({ fieldTheme: { color: { canvas: "white" } }, useFieldColorScheme: () => "light" }))

import AttendanceApp from "../../src/attendance/AttendanceApp"
import { useAuthStore } from "../../src/store/auth"
import { useBootstrapStore } from "../../src/store/bootstrap"
import { refreshAttendanceSession } from "../../src/services/attendance-session"
import { startForegroundSyncRetry } from "../../src/services/foreground-sync-retry"
import { officeAgent, officeBootstrap } from "../../test-support/office-attendance"

let tree: ReactTestRenderer | undefined
const stopRetry = jest.fn(), removeNetwork = jest.fn(), removeLifecycle = jest.fn()
let network: (state: { isConnected: boolean; isInternetReachable: boolean }) => void
let lifecycle: (state: string) => void
beforeEach(() => {
  jest.clearAllMocks()
  ;(startForegroundSyncRetry as jest.Mock).mockReturnValue(stopRetry)
  ;(NetInfo.addEventListener as jest.Mock).mockImplementation(callback => { network = callback; return removeNetwork })
  ;(AppState.addEventListener as jest.Mock).mockImplementation((_event, callback) => { lifecycle = callback; return { remove: removeLifecycle } })
  useAuthStore.setState({ isLoggedIn: true, agent: officeAgent as never, checkAuth: async () => {} })
  useBootstrapStore.setState({ data: officeBootstrap() })
})
afterEach(async () => { await act(async () => { tree?.unmount(); tree = undefined }) })
async function mount() { await act(async () => { tree = create(<AttendanceApp />) }) }

it("starts the personal sync only after admission and refreshes after foreground/reconnection without requesting location", async () => {
  await mount()
  expect(startForegroundSyncRetry).toHaveBeenCalledTimes(1)
  expect(refreshAttendanceSession).toHaveBeenCalledTimes(1)
  await act(async () => { lifecycle("background") })
  expect(refreshAttendanceSession).toHaveBeenCalledTimes(1)
  await act(async () => { lifecycle("active"); network({ isConnected: true, isInternetReachable: true }) })
  expect(refreshAttendanceSession).toHaveBeenCalledTimes(3)
  expect(Geolocation.setRNConfiguration).toHaveBeenCalledWith({ skipPermissionRequests: true, locationProvider: "android" })
  expect(Geolocation.getCurrentPosition).not.toHaveBeenCalled()
  expect(PermissionsAndroid.request).not.toHaveBeenCalled()
  expect(PermissionsAndroid.requestMultiple).not.toHaveBeenCalled()
})
it("revoking personal attendance stops the queue; logout removes network/lifecycle listeners", async () => {
  await mount()
  const revoked = officeBootstrap()
  revoked.policies.agentPermissions!.attendanceWorkday = false
  await act(async () => { useBootstrapStore.setState({ data: revoked }) })
  expect(stopRetry).toHaveBeenCalledTimes(1)
  await act(async () => { useAuthStore.setState({ isLoggedIn: false, agent: null }) })
  expect(removeNetwork).toHaveBeenCalledTimes(1)
  expect(removeLifecycle).toHaveBeenCalledTimes(1)
})
it.each(["AGENT", "foreign"])("cannot start the personal queue for %s admission", async role => {
  useAuthStore.setState({ agent: { ...officeAgent, ...(role === "AGENT" ? { role } : { organizationId: "foreign" }) } as never })
  useBootstrapStore.setState({ data: officeBootstrap(role === "AGENT" ? role : "EMPLOYEE") })
  await mount()
  expect(startForegroundSyncRetry).not.toHaveBeenCalled()
})

it("revalidates the bounded local admission immediately when connectivity is lost", async () => {
  await mount()
  await act(async () => { network({ isConnected: false, isInternetReachable: false }) })
  expect(refreshAttendanceSession).toHaveBeenCalledTimes(2)
})
