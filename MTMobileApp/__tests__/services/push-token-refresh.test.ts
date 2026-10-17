jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"))

const mockNative = { getToken: jest.fn(), consumePendingToken: jest.fn(), deleteToken: jest.fn() }
// A getter: the factory runs while this file's imports load, before `mockNative` is assigned.
jest.mock("react-native", () => ({ NativeModules: { get FieldPush() { return mockNative } }, Platform: { OS: "android" } }))
jest.mock("../../src/services/api", () => ({ api: { registerDeviceToken: jest.fn(), unregisterDeviceToken: jest.fn() } }))
jest.mock("../../src/services/field-device-id", () => ({ getFieldDeviceId: jest.fn().mockResolvedValue("device-1") }))

import fs from "fs"
import path from "path"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { api } from "../../src/services/api"
import { clearOfflineScope, setOfflineScope } from "../../src/services/offline-scope"
import {
  PUSH_REREGISTER_AFTER_MS,
  pushRegistrationDue,
  refreshPushToken,
  registerPushToken,
} from "../../src/services/push-registration"

const register = api.registerDeviceToken as jest.Mock
const TOKEN_A = "fcm-token-aaaaaaaaaaaaaaaaaaaa"
const TOKEN_B = "fcm-token-bbbbbbbbbbbbbbbbbbbb"
const SCOPE = "org-1:agent-1"
const always = () => true

beforeEach(async () => {
  jest.clearAllMocks()
  await AsyncStorage.clear()
  setOfflineScope("org-1", "agent-1")
  mockNative.consumePendingToken.mockResolvedValue(null)
  mockNative.getToken.mockResolvedValue(TOKEN_A)
  register.mockResolvedValue({ success: true, data: { pushEnabled: true } })
})

/**
 * 2026-10-17: on Android the address went to the server only at sign-in and
 * from «Bildirişlər». A token Firebase rotated stayed dead on the server
 * until the next login.
 */
describe("the push address follows Firebase's token", () => {
  it("is due for a new token, and for the same one only after a day", () => {
    const now = 1_000_000_000
    expect(pushRegistrationDue(null, TOKEN_A, now)).toBe(true)
    expect(pushRegistrationDue({ token: TOKEN_A, outcome: "registered", at: now - 1000 }, TOKEN_A, now)).toBe(false)
    expect(pushRegistrationDue({ token: TOKEN_A, outcome: "registered", at: now - 1000 }, TOKEN_B, now)).toBe(true)
    expect(pushRegistrationDue({ token: TOKEN_A, outcome: "registered", at: now - PUSH_REREGISTER_AFTER_MS }, TOKEN_A, now)).toBe(true)
    // A refusal is not retried in a loop: the same token waits a day.
    expect(pushRegistrationDue({ token: TOKEN_A, outcome: "refused", at: now - 1000 }, TOKEN_A, now)).toBe(false)
  })

  it("registers once on start and not again on every return to the app", async () => {
    await refreshPushToken(SCOPE, always)
    await refreshPushToken(SCOPE, always)
    expect(register).toHaveBeenCalledTimes(1)
    expect(register.mock.calls[0][0]).toMatchObject({ token: TOKEN_A, platform: "android", deviceId: "device-1" })
  })

  it("registers a rotated token at once, announced or read", async () => {
    await refreshPushToken(SCOPE, always)
    await refreshPushToken(SCOPE, always, TOKEN_B)
    expect(register).toHaveBeenCalledTimes(2)
    expect(register.mock.calls[1][0].token).toBe(TOKEN_B)
    // The pending copy of the same token, read on the next start, is not sent twice.
    mockNative.consumePendingToken.mockResolvedValueOnce(TOKEN_B)
    await refreshPushToken(SCOPE, always)
    expect(register).toHaveBeenCalledTimes(2)
  })

  it("sends the same address again after a day, as the server's sign of life", async () => {
    let now = 5_000_000_000_000
    const clock = jest.spyOn(Date, "now").mockImplementation(() => now)
    await refreshPushToken(SCOPE, always)
    now += PUSH_REREGISTER_AFTER_MS - 1
    await refreshPushToken(SCOPE, always)
    expect(register).toHaveBeenCalledTimes(1)
    now += 1
    await refreshPushToken(SCOPE, always)
    expect(register).toHaveBeenCalledTimes(2)
    clock.mockRestore()
  })

  it("does not retry a refused address in a loop", async () => {
    register.mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403 }))
    await refreshPushToken(SCOPE, always)
    await refreshPushToken(SCOPE, always)
    await refreshPushToken(SCOPE, always)
    expect(register).toHaveBeenCalledTimes(1)
  })

  it("registers nothing for a session that has ended", async () => {
    await refreshPushToken(SCOPE, () => false)
    clearOfflineScope()
    await refreshPushToken(SCOPE, always)
    expect(register).not.toHaveBeenCalled()
  })

  it("keeps the login and the screen's own registration working, and remembers them", async () => {
    await registerPushToken()
    expect(register).toHaveBeenCalledTimes(1)
    await refreshPushToken(SCOPE, always)
    expect(register).toHaveBeenCalledTimes(1)
  })

  it("keeps each principal's record apart", async () => {
    await refreshPushToken(SCOPE, always)
    setOfflineScope("org-1", "manager-1")
    await refreshPushToken("org-1:manager-1", always)
    expect(register).toHaveBeenCalledTimes(2)
  })
})

describe("wiring", () => {
  const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8")

  it("runs for every signed-in role, on start, on the return to the foreground and on Firebase's refresh", () => {
    const app = read("src/runtime/AndroidApp.tsx")
    expect(app).toContain("return startPushTokenRefresh({ organizationId: agent?.organizationId, id: agent?.id })")
    expect(app.slice(app.indexOf("return startPushTokenRefresh") - 200, app.indexOf("return startPushTokenRefresh"))).not.toContain('role === "AGENT"')
    const lifecycle = read("src/services/push-lifecycle.ts")
    expect(lifecycle).toContain('AppState.addEventListener("change"')
    expect(lifecycle).toContain("DeviceEventEmitter.addListener(PUSH_TOKEN_REFRESH_EVENT")
    expect(lifecycle).toContain("const stillCurrent = () => !stopped && getOfflineScope() === scope")
  })

  it("has the native service announce a rotated token to the running app", () => {
    const service = read("android/app/src/main/java/com/mtmobileapp/FieldPushService.kt")
    expect(service).toContain("FieldPushModule.announceToken(token)")
    expect(service).toContain('const val TOKEN_REFRESH_EVENT = "FieldPushTokenRefresh"')
    expect(read("src/services/push-lifecycle.ts")).toContain('export const PUSH_TOKEN_REFRESH_EVENT = "FieldPushTokenRefresh"')
  })
})
