import fs from "fs"
import path from "path"

/**
 * 2026-09-29, the owner's Galaxy S23: off on 27.09 at 17:30, on again on
 * 28.09 at 19:43 — and two days without a point with the workday open,
 * because nothing started the app again. Tracking now leaves what it needs
 * with the native side, which brings it back after a restart or an update.
 */
let mockRunning = false

jest.mock("react-native", () => ({
  NativeModules: {
    FieldLocation: {
      start: jest.fn(async () => true),
      stop: jest.fn(async () => true),
      rememberTracking: jest.fn(async () => true),
      forgetTracking: jest.fn(async () => true),
    },
  },
  NativeEventEmitter: class {
    addListener() {
      return { remove: () => {} }
    }
  },
}))
jest.mock("react-native-background-actions", () => ({
  __esModule: true,
  default: {
    isRunning: () => mockRunning,
    start: jest.fn(async () => { mockRunning = true }),
    stop: jest.fn(async () => { mockRunning = false }),
  },
}))
jest.mock("@react-native-community/geolocation", () => ({
  __esModule: true,
  default: { setRNConfiguration: jest.fn(), watchPosition: jest.fn(), clearWatch: jest.fn(), getCurrentPosition: jest.fn() },
}))
jest.mock("../../src/services/api", () => ({ api: { sendLocation: jest.fn(async () => ({})) } }))
jest.mock("../../src/i18n/index.android", () => ({ i18n: { t: (key: string) => `t:${key}` } }))
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)

import BackgroundService from "react-native-background-actions"
import { NativeModules } from "react-native"
import {
  forgetTrackingResume,
  runTrackingUntilStopped,
  startTracking,
  stopTracking,
} from "../../src/services/location.android"

const native = (NativeModules as unknown as {
  FieldLocation: { start: jest.Mock; rememberTracking: jest.Mock; forgetTracking: jest.Mock }
}).FieldLocation
const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8")
const flush = () => new Promise((resolve) => setImmediate(resolve))

describe("tracking that comes back after a restart", () => {
  beforeEach(() => {
    mockRunning = false
    jest.clearAllMocks()
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] })
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it("leaves the service texts and the agent's message with the native side when it starts", async () => {
    await startTracking()
    expect(native.rememberTracking).toHaveBeenCalledWith({
      title: "t:location.taskTitle",
      desc: "t:location.taskDesc",
      stoppedTitle: "t:location.stoppedTitle",
      stoppedBody: "t:location.stoppedBody",
    })
    // A stop waits until the service had time to come up (start/stop race suite).
    const stopping = stopTracking()
    await jest.advanceTimersByTimeAsync(3_000)
    await stopping
  })

  it("does not start a second service over the one the native side brought back", async () => {
    const loop = runTrackingUntilStopped()
    await flush()
    expect(native.start).toHaveBeenCalledTimes(1)
    await startTracking()
    expect(BackgroundService.start).not.toHaveBeenCalled()
    // Ending the day ends the loop, and with it the service it runs in.
    await stopTracking()
    await expect(loop).resolves.toBeUndefined()
  })

  it("forgets it when the day is over", () => {
    forgetTrackingResume()
    expect(native.forgetTracking).toHaveBeenCalledTimes(1)
  })
})

describe("the pieces that have to agree", () => {
  const manifest = read("android/app/src/main/AndroidManifest.xml")
  const resume = read("android/app/src/main/java/com/mtmobileapp/FieldTrackingResume.kt")

  it("listens for a restart and an update, and may ask for location «all the time»", () => {
    expect(manifest).toContain('<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />')
    expect(manifest).toContain('<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />')
    expect(manifest).toContain('android:name=".FieldTrackingResumeReceiver"')
    expect(manifest).toContain('<action android:name="android.intent.action.BOOT_COMPLETED" />')
    expect(manifest).toContain('<action android:name="android.intent.action.MY_PACKAGE_REPLACED" />')
    expect(resume).toContain("Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> FieldTrackingResume.resume(context)")
  })

  it("starts the library's own location service under the task the JS registers", () => {
    expect(resume).toContain('const val TASK_NAME = "FieldResumeTracking"')
    expect(resume).toContain("Intent(context, RNBackgroundActionsTask::class.java)")
    expect(resume).toContain('putStringArrayList("foregroundServiceType", arrayListOf("location"))')
    expect(read("index.js")).toContain("AppRegistry.registerHeadlessTask('FieldResumeTracking', () => require('./src/services/tracking-resume').resumeTrackingTask)")
    // Without «all the time» Android refuses the start: the agent is told instead.
    expect(resume).toContain("if (mayTrackInBackground(context) && startTrackingService(context)) return")
  })

  it("does not stop tracking the restart brought back before the app knows the session and the day", () => {
    const app = read("src/runtime/AndroidApp.tsx")
    const branch = app.slice(app.indexOf("if (!mayTrack || !activeWorkdayId) {"), app.indexOf("void (async () => {"))
    expect(branch.indexOf("if (authLoading || !workdayHydrated) {")).toBeLessThan(branch.indexOf("stopTracking()"))
    expect(branch).toContain("forgetTrackingResume()")
  })

  it("tells the agent in three languages", () => {
    for (const locale of ["ru", "en", "az"]) {
      const location = JSON.parse(read(`src/i18n/locales/${locale}.json`)).location
      expect(location.stoppedTitle).toEqual(expect.any(String))
      expect(location.stoppedBody).toEqual(expect.any(String))
    }
  })
})
