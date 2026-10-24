import AsyncStorage from "@react-native-async-storage/async-storage"
import { AppState, Linking } from "react-native"
import DeviceInfo from "react-native-device-info"
import { ask } from "../../src/services/app-feedback"
import { checkTimeAppUpdate } from "../../src/services/time-app-update"
import { TIME_APP_PACKAGE, TIME_APP_CHANNEL, TIME_APP_CERTIFICATE, TIME_APP_DOWNLOAD_URL, TIME_APP_STORE_URL } from "../../src/services/time-app-update-policy"

jest.mock("@react-native-async-storage/async-storage", () => ({ getItem: jest.fn(), setItem: jest.fn() }))
jest.mock("react-native", () => ({ AppState: { currentState: "active" }, Linking: { openURL: jest.fn() } }))
jest.mock("react-native-device-info", () => ({ __esModule: true, default: { getBundleId: jest.fn(), getBuildNumber: jest.fn(), getInstallerPackageName: jest.fn() } }))
jest.mock("../../src/services/app-feedback", () => ({ ask: jest.fn() }))
jest.mock("../../src/i18n/index.android", () => ({ i18n: { t: (key: string) => key } }))

const latest = {
  packageName: TIME_APP_PACKAGE, channel: TIME_APP_CHANNEL, signingCertificateSha256: TIME_APP_CERTIFICATE,
  apkSha256: "a".repeat(64), versionCode: 1100, versionName: "1.0.1", downloadUrl: TIME_APP_DOWNLOAD_URL, storeUrl: null,
}
const originalFetch = global.fetch
const mockFetch = jest.fn()
const response = (body: unknown = latest) => ({ ok: true, json: async () => body })
beforeEach(() => {
  jest.clearAllMocks()
  AppState.currentState = "active"
  global.fetch = mockFetch
  mockFetch.mockReset().mockResolvedValue(response())
  ;(DeviceInfo.getBundleId as jest.Mock).mockReturnValue(TIME_APP_PACKAGE)
  ;(DeviceInfo.getBuildNumber as jest.Mock).mockReturnValue("1042")
  ;(DeviceInfo.getInstallerPackageName as jest.Mock).mockReset().mockResolvedValue(null)
  ;(AsyncStorage.getItem as jest.Mock).mockReset().mockResolvedValue(null)
  ;(AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined)
  ;(ask as jest.Mock).mockReset().mockResolvedValue("later")
  ;(Linking.openURL as jest.Mock).mockReset().mockResolvedValue(undefined)
})
afterEach(() => { global.fetch = originalFetch; jest.useRealTimers() })

it("Later keeps working and stores only its separate reminder", async () => {
  await checkTimeAppUpdate({ coldStart: true })
  expect(ask).toHaveBeenCalledWith(expect.objectContaining({ message: "timeAppUpdate.messageApk", dismissValue: "later" }))
  expect(AsyncStorage.setItem).toHaveBeenCalledWith("@leaddrive_time_update_asked_v1", expect.any(String))
  expect(Linking.openURL).not.toHaveBeenCalled()
})
it("opens a download only after an explicit choice; Android owns installation", async () => {
  ;(ask as jest.Mock).mockResolvedValue("update")
  await checkTimeAppUpdate({ coldStart: true })
  expect(Linking.openURL).toHaveBeenCalledWith(TIME_APP_DOWNLOAD_URL)
})
it("sends a Play installation only to the enabled Time listing", async () => {
  ;(DeviceInfo.getInstallerPackageName as jest.Mock).mockResolvedValue("com.android.vending")
  await checkTimeAppUpdate({ coldStart: true })
  expect(ask).not.toHaveBeenCalled()
  mockFetch.mockResolvedValue(response({ ...latest, storeUrl: TIME_APP_STORE_URL }))
  ;(ask as jest.Mock).mockResolvedValue("update")
  await checkTimeAppUpdate({ coldStart: true })
  expect(ask).toHaveBeenCalledWith(expect.objectContaining({ message: "timeAppUpdate.messagePlay" }))
  expect(Linking.openURL).toHaveBeenCalledWith(TIME_APP_STORE_URL)
})
it("does not guess APK provenance when the native installer lookup fails", async () => {
  ;(DeviceInfo.getInstallerPackageName as jest.Mock).mockRejectedValue(new Error("native unavailable"))
  await expect(checkTimeAppUpdate({ coldStart: true })).resolves.toBeUndefined()
  expect(mockFetch).not.toHaveBeenCalled()
  expect(ask).not.toHaveBeenCalled()
})
it.each(["offline", "unavailable", "foreign"])("stays quiet for %s and never falls back to Field", async reason => {
  if (reason === "offline") mockFetch.mockRejectedValue(new Error("offline"))
  if (reason === "unavailable") mockFetch.mockResolvedValue({ ok: false })
  if (reason === "foreign") mockFetch.mockResolvedValue(response({ ...latest, packageName: "com.mtmobileapp" }))
  await expect(checkTimeAppUpdate({ coldStart: true })).resolves.toBeUndefined()
  expect(ask).not.toHaveBeenCalled()
  expect(Linking.openURL).not.toHaveBeenCalled()
})
it("times out an unresponsive network request and permits a later retry", async () => {
  jest.useFakeTimers()
  mockFetch.mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new Error("aborted")))
  }))
  const check = checkTimeAppUpdate({ coldStart: true })
  await Promise.resolve()
  await jest.advanceTimersByTimeAsync(10_000)
  await expect(check).resolves.toBeUndefined()
  expect(ask).not.toHaveBeenCalled()
  await checkTimeAppUpdate({ coldStart: false })
  expect(ask).toHaveBeenCalledTimes(1)
})
it("deduplicates overlapping checks and ignores a result after leaving the foreground", async () => {
  let finish!: (value: ReturnType<typeof response>) => void
  mockFetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const first = checkTimeAppUpdate({ coldStart: true })
  const second = checkTimeAppUpdate({ coldStart: false })
  expect(second).toBe(first)
  await Promise.resolve()
  AppState.currentState = "background"
  finish(response())
  await first
  expect(mockFetch).toHaveBeenCalledTimes(1)
  expect(ask).not.toHaveBeenCalled()
})
it("does not show an offer after its runtime unmounts", async () => {
  let mounted = true
  mockFetch.mockImplementationOnce(async () => { mounted = false; return response() })
  await checkTimeAppUpdate({ coldStart: true, isCurrent: () => mounted })
  expect(ask).not.toHaveBeenCalled()
})
it("respects a recent Later on resume, but checks again on cold start", async () => {
  ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({ versionCode: 1100, at: Date.now() }))
  await checkTimeAppUpdate({ coldStart: false })
  expect(ask).not.toHaveBeenCalled()
  await checkTimeAppUpdate({ coldStart: true })
  expect(ask).toHaveBeenCalledTimes(1)
})
it("rejects an incorrect installed identity without leaving the checker stuck", async () => {
  ;(DeviceInfo.getBundleId as jest.Mock).mockReturnValue("com.mtmobileapp")
  await checkTimeAppUpdate({ coldStart: true })
  expect(mockFetch).not.toHaveBeenCalled()
  ;(DeviceInfo.getBundleId as jest.Mock).mockReturnValue(TIME_APP_PACKAGE)
  await checkTimeAppUpdate({ coldStart: true })
  expect(ask).toHaveBeenCalledTimes(1)
})
