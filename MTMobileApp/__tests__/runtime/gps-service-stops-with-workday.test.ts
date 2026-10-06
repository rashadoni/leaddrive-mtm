import fs from "fs"
import path from "path"

/**
 * 2026-10-07, the owner's phone: the workday was finished, no point reached
 * the server after that — and the tracking service's notification, «your
 * location is being recorded during the workday», stayed in the shade.
 *
 * react-native-background-actions stops only the service it believes it
 * started in this run of the app. Ending the day now also ends the service by
 * its class, whoever started it.
 */
const mockEvents: string[] = []
let mockRunning = false

jest.mock("react-native", () => ({
  NativeModules: {
    FieldLocation: {
      start: jest.fn(async () => true),
      stop: jest.fn(async () => true),
      rememberTracking: jest.fn(async () => true),
      forgetTracking: jest.fn(async () => true),
      stopTrackingService: jest.fn(async () => { mockEvents.push("service-stop"); return true }),
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
    start: jest.fn(async () => { mockEvents.push("library-start"); mockRunning = true }),
    stop: jest.fn(async () => { mockEvents.push("library-stop"); mockRunning = false }),
  },
}))
jest.mock("@react-native-community/geolocation", () => ({
  __esModule: true,
  default: { setRNConfiguration: jest.fn(), watchPosition: jest.fn(), clearWatch: jest.fn(), getCurrentPosition: jest.fn() },
}))
jest.mock("../../src/services/api", () => ({ api: { sendLocation: jest.fn(async () => ({})) } }))
jest.mock("../../src/i18n/index.android", () => ({ i18n: { t: (key: string) => key } }))
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)

import { NativeModules } from "react-native"
import { startTracking, stopTracking } from "../../src/services/location.android"

const native = (NativeModules as unknown as { FieldLocation: { stopTrackingService: jest.Mock } }).FieldLocation
const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8")

describe("the tracking service ends with the workday", () => {
  beforeEach(() => {
    mockEvents.length = 0
    mockRunning = false
    jest.clearAllMocks()
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] })
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it("ends a service the library knows nothing about", async () => {
    // As after the phone restarted the service itself: the library's own flag says «not running».
    const stopping = stopTracking()
    await jest.advanceTimersByTimeAsync(3_000)
    await stopping

    expect(mockEvents).toEqual(["service-stop"])
  })

  it("asks the library first and the service itself after it", async () => {
    await startTracking()
    const stopping = stopTracking()
    await jest.advanceTimersByTimeAsync(3_000)
    await stopping

    expect(mockEvents).toEqual(["library-start", "library-stop", "service-stop"])
  })

  it("never ends a service within the first seconds of its life", async () => {
    // Android kills the app for stopping a foreground service that has not come up yet.
    await startTracking()
    const stopping = stopTracking()
    await jest.advanceTimersByTimeAsync(2_900)
    expect(mockEvents).toEqual(["library-start"])

    await jest.advanceTimersByTimeAsync(200)
    await stopping
    expect(mockEvents).toEqual(["library-start", "library-stop", "service-stop"])
  })

  it("still ends the day when the phone refuses the stop", async () => {
    native.stopTrackingService.mockRejectedValueOnce(new Error("refused"))
    const stopping = stopTracking()
    await jest.advanceTimersByTimeAsync(3_000)

    await expect(stopping).resolves.toBeUndefined()
  })

  it("is the service's own class that is stopped, and a refusal is an answer, not a crash", () => {
    const module = read("android/app/src/main/java/com/mtmobileapp/FieldLocationModule.kt")
    const method = module.slice(module.indexOf("fun stopTrackingService(promise: Promise)"))
    expect(method).toContain("reactContext.stopService(Intent(reactContext, RNBackgroundActionsTask::class.java))")
    expect(method.slice(0, method.indexOf("\n  }\n"))).toContain("promise.resolve(false)")
    // The same class the phone starts after a restart or an update.
    expect(read("android/app/src/main/java/com/mtmobileapp/FieldTrackingResume.kt"))
      .toContain("Intent(context, RNBackgroundActionsTask::class.java)")
  })
})
