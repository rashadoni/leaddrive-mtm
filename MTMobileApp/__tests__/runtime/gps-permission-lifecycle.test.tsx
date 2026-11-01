import React from "react"
import { act, create, type ReactTestRenderer } from "react-test-renderer"
import { AppState, PermissionsAndroid } from "react-native"

jest.mock("react-native", () => ({
  AppState: { currentState: "active", addEventListener: jest.fn() },
  PermissionsAndroid: {
    PERMISSIONS: { ACCESS_FINE_LOCATION: "fine", ACCESS_COARSE_LOCATION: "coarse", POST_NOTIFICATIONS: "notifications" },
    RESULTS: { GRANTED: "granted", DENIED: "denied" }, check: jest.fn(), requestMultiple: jest.fn(), request: jest.fn(),
  },
  Platform: { OS: "android", Version: 36 }, StyleSheet: { create: (value: unknown) => value },
  View: "View", ActivityIndicator: "ActivityIndicator", StatusBar: "StatusBar",
}))
jest.mock("react-native-safe-area-context", () => ({ SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children }))
jest.mock("@react-native-community/netinfo", () => ({ fetch: jest.fn(async () => ({ isConnected: true })), addEventListener: jest.fn(() => () => {}) }))
jest.mock("../../src/navigation/AppNavigatorAndroidV2", () => () => null)
jest.mock("../../src/components/ErrorBoundary", () => ({ ErrorBoundary: ({ children }: { children: React.ReactNode }) => children }))
jest.mock("../../src/components/AppFeedbackHost", () => () => null)
jest.mock("../../src/components/LaunchSplash", () => () => null)
jest.mock("../../src/store/auth", () => ({ useAuthStore: require("zustand").create(() => ({})) }))
jest.mock("../../src/store/workday", () => ({ useWorkdayStore: require("zustand").create(() => ({})), workdayKey: (org?: string, agent?: string) => `${org}:${agent}` }))
jest.mock("../../src/store/hints", () => ({ useHintsStore: { getState: () => ({ hydrate: async () => {} }) } }))
jest.mock("../../src/store/location-fixes", () => ({ useLocationFixStore: { getState: () => ({ hydrate: async () => {} }) } }))
jest.mock("../../src/store/sync-status", () => ({ useSyncStatusStore: { getState: () => ({ setOnline: jest.fn() }) } }))
jest.mock("../../src/services/location.android", () => ({ forgetTrackingResume: jest.fn(), setTrackingWorkdayId: jest.fn(), startTracking: jest.fn(async () => {}), stopTracking: jest.fn(async () => {}) }))
jest.mock("../../src/services/api", () => ({ api: { setUnauthorizedHandler: jest.fn() } }))
jest.mock("../../src/services/sync-engine", () => ({ markMobileOffline: jest.fn(async () => {}) }))
jest.mock("../../src/services/foreground-sync-retry", () => ({ startForegroundSyncRetry: jest.fn(() => () => {}) }))
jest.mock("../../src/i18n/index.android", () => ({ initI18n: jest.fn(async () => {}) }))
jest.mock("../../src/services/sentry", () => ({ initSentry: jest.fn() }))
jest.mock("../../src/services/connection-health", () => ({ dropIdleConnections: jest.fn() }))
jest.mock("../../src/services/attendance-session", () => ({ refreshAttendanceSession: jest.fn(async () => {}) }))
jest.mock("../../src/services/field-session", () => ({ refreshRouteFieldSession: jest.fn(async () => {}) }))
jest.mock("../../src/services/app-feedback", () => ({ dismissAllChoices: jest.fn(), ask: jest.fn() }))
jest.mock("@react-native-community/geolocation", () => ({ setRNConfiguration: jest.fn(), getCurrentPosition: jest.fn() }))
jest.mock("../../src/services/push-lifecycle", () => ({ startPushTokenRefresh: jest.fn(() => () => {}) }))
jest.mock("../../src/services/field-app-update", () => ({ checkFieldAppUpdate: jest.fn(async () => {}) }))

import AndroidApp from "../../src/runtime/AndroidApp"
import { useAuthStore } from "../../src/store/auth"
import { useWorkdayStore } from "../../src/store/workday"
import { startTracking } from "../../src/services/location.android"
import { ask } from "../../src/services/app-feedback"
import Geolocation from "@react-native-community/geolocation"

const callbacks = new Set<(state: string) => void>()
const check = PermissionsAndroid.check as jest.Mock
const request = PermissionsAndroid.requestMultiple as jest.Mock
let tree: ReactTestRenderer | undefined
let principal = 0
let granted = false
function lifecycle(next: string) {
  (AppState as { currentState: string }).currentState = next
  for (const callback of callbacks) callback(next)
}
async function foreground() {
  await act(async () => { lifecycle("background") })
  await act(async () => { lifecycle("active") })
}
async function mount() { await act(async () => { tree = create(<AndroidApp />) }) }
beforeEach(() => {
  jest.clearAllMocks(); callbacks.clear(); granted = false
  ;(AppState as { currentState: string }).currentState = "active"
  ;(AppState.addEventListener as jest.Mock).mockImplementation((_event, callback) => { callbacks.add(callback); return { remove: () => callbacks.delete(callback) } })
  check.mockImplementation(async (permission: string) => permission === "notifications" || granted)
  request.mockResolvedValue({ fine: "denied", coarse: "denied" })
  ;(ask as jest.Mock).mockResolvedValue(true)
  const id = `fictional-field-${++principal}`
  useAuthStore.setState({ isLoggedIn: true, isLoading: false, serverDomain: "fictional.invalid", agent: { id, organizationId: "fictional-tenant", role: "AGENT" } as never })
  useWorkdayStore.setState({ hydrated: true, hydrate: async () => {}, activeWorkday: { key: `fictional-tenant:${id}`, workdayId: "fictional-day", startedAt: "2026-10-14T03:35:00.000Z", syncState: "CONFIRMED" } })
})
afterEach(async () => { await act(async () => { tree?.unmount(); tree = undefined }) })

it("actual AndroidApp foreground/effect churn never repeats the denied sheet and later detects an explicit grant", async () => {
  let answer!: (value: Record<string, string>) => void
  request.mockReturnValueOnce(new Promise(resolve => { answer = resolve }))
  await mount(); expect(request).toHaveBeenCalledTimes(1)
  await foreground(); expect(request).toHaveBeenCalledTimes(1)
  await act(async () => { answer({ fine: "denied", coarse: "denied" }) })
  for (let i = 0; i < 12; i++) await foreground()
  expect(request).toHaveBeenCalledTimes(1); expect(startTracking).not.toHaveBeenCalled()
  granted = true; await foreground()
  expect(request).toHaveBeenCalledTimes(1); expect(startTracking).toHaveBeenCalledTimes(1)
})

it("pause, resume, auth loading and component remount retain the principal's denied attempt", async () => {
  await mount(); expect(request).toHaveBeenCalledTimes(1)
  const workday = useWorkdayStore.getState().activeWorkday!
  await act(async () => { useWorkdayStore.setState({ activeWorkday: { ...workday, paused: true } }) })
  await act(async () => { useWorkdayStore.setState({ activeWorkday: { ...workday, paused: false } }) })
  await act(async () => { useAuthStore.setState({ isLoading: true }) })
  await act(async () => { useAuthStore.setState({ isLoading: false }) })
  await act(async () => { tree?.unmount(); tree = undefined })
  await mount(); await foreground()
  expect(request).toHaveBeenCalledTimes(1); expect(startTracking).not.toHaveBeenCalled()
})

it("account/server change while the sheet is open neither overlaps requests nor starts tracking from its old answer", async () => {
  let answer!: (value: Record<string, string>) => void
  request.mockReturnValueOnce(new Promise(resolve => { answer = resolve }))
  await mount()
  await act(async () => {
    useAuthStore.setState({ serverDomain: "other-fictional.invalid", agent: { id: "other-field", organizationId: "other-tenant", role: "AGENT" } as never })
    useWorkdayStore.setState({ activeWorkday: { key: "other-tenant:other-field", workdayId: "other-day", startedAt: "2026-10-14T03:35:00.000Z", syncState: "CONFIRMED" } })
  })
  expect(request).toHaveBeenCalledTimes(1)
  await act(async () => { answer({ fine: "granted", coarse: "granted" }) })
  expect(startTracking).not.toHaveBeenCalled()
  await foreground(); expect(request).toHaveBeenCalledTimes(2)
  expect(startTracking).not.toHaveBeenCalled()
})

it("logout fences a late permission answer and office attendance never requests tracking permission", async () => {
  let answer!: (value: Record<string, string>) => void
  request.mockReturnValueOnce(new Promise(resolve => { answer = resolve }))
  await mount()
  await act(async () => { useAuthStore.setState({ isLoggedIn: false, agent: null }) })
  await act(async () => { answer({ fine: "granted", coarse: "granted" }) })
  await foreground(); expect(startTracking).not.toHaveBeenCalled()
  await act(async () => { useAuthStore.setState({ isLoggedIn: true, agent: { id: "fictional-office", organizationId: "fictional-tenant", role: "EMPLOYEE" } as never }) })
  await foreground(); expect(request).toHaveBeenCalledTimes(1)
})

// Google Play, 2026-10-18: the app's own disclosure before Android's location sheet.
it("shows the disclosure before Android's sheet, and «Не сейчас» opens no sheet and starts no tracking", async () => {
  ;(ask as jest.Mock).mockResolvedValue(false)
  await mount()
  expect(ask).toHaveBeenCalledTimes(1)
  // Closing it without a button is «Не сейчас» too (its words: location-disclosure.test.ts).
  expect((ask as jest.Mock).mock.calls[0][0]).toMatchObject({ dismissValue: false })
  for (let i = 0; i < 6; i++) await foreground()
  expect(ask).toHaveBeenCalledTimes(1)
  expect(request).not.toHaveBeenCalled(); expect(startTracking).not.toHaveBeenCalled()
})

it("«Продолжить» leads to Android's sheet, after the disclosure", async () => {
  await mount()
  expect(ask).toHaveBeenCalledTimes(1); expect(request).toHaveBeenCalledTimes(1)
  expect((ask as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(request.mock.invocationCallOrder[0])
})

it("a grant already given asks nothing", async () => {
  granted = true
  await mount()
  expect(ask).not.toHaveBeenCalled(); expect(request).not.toHaveBeenCalled(); expect(startTracking).toHaveBeenCalledTimes(1)
})

it("tells the geolocation library at launch never to bring up the sheet by itself", async () => {
  await mount()
  expect(Geolocation.setRNConfiguration).toHaveBeenCalledWith({ skipPermissionRequests: true, locationProvider: "android" })
})
