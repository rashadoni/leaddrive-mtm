import fs from "fs"
import path from "path"

/**
 * The owner's drive, 2026-09-22: fifteen minutes and six kilometres between
 * two points on the manager's map. The positions now come from Google's fused
 * provider through a native module, so the OS does the sampling and a
 * backgrounded app only uploads.
 */
type Listener = (event: Record<string, unknown>) => void

const mockSent: Array<{ latitude: number }> = []
let mockRunning = false

// The factory runs before this file's consts exist, so the mocks live inside it.
jest.mock("react-native", () => ({
  NativeModules: { FieldLocation: { start: jest.fn(async () => true), stop: jest.fn(async () => true) } },
  NativeEventEmitter: class {
    addListener(_event: string, listener: (event: Record<string, unknown>) => void) {
      mockNativeListener.current = listener
      return { remove: () => { mockNativeListener.current = null } }
    }
  },
}))
/** Shared by the factory above and the test body; `mock*` survives hoisting. */
const mockNativeListener: { current: Listener | null } = { current: null }
jest.mock("react-native-background-actions", () => ({
  __esModule: true,
  default: {
    isRunning: () => mockRunning,
    start: jest.fn(async (task: (data: unknown) => Promise<void>) => { mockRunning = true; void task({}) }),
    stop: jest.fn(async () => { mockRunning = false }),
  },
}))
jest.mock("@react-native-community/geolocation", () => ({
  __esModule: true,
  default: { setRNConfiguration: jest.fn(), watchPosition: jest.fn(), clearWatch: jest.fn(), getCurrentPosition: jest.fn() },
}))
jest.mock("../../src/services/api", () => ({
  api: { sendLocation: jest.fn(async (point: { latitude: number }) => { mockSent.push(point); return {} }) },
}))
jest.mock("../../src/i18n/index.android", () => ({ i18n: { t: (key: string) => key } }))
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)

import Geolocation from "@react-native-community/geolocation"
import { NativeModules } from "react-native"
import { startTracking, stopTracking } from "../../src/services/location.android"

const { start: mockStart, stop: mockStop } = (NativeModules as unknown as {
  FieldLocation: { start: jest.Mock; stop: jest.Mock }
}).FieldLocation

const flush = () => new Promise((resolve) => setImmediate(resolve))
const t0 = Date.parse("2026-09-22T17:30:00.000Z")
const fix = (latitude: number, timestamp: number, accuracy: number) =>
  ({ latitude, longitude: 49.9, accuracy, speed: 12, heading: 90, altitude: 10, timestamp })

describe("positions from the fused provider", () => {
  beforeEach(() => {
    mockSent.length = 0
    mockRunning = false
    mockNativeListener.current = null
    mockStart.mockClear()
    mockStop.mockClear()
  })

  it("streams from the OS instead of watching one provider from JS", async () => {
    await startTracking()
    await flush()
    expect(mockStart).toHaveBeenCalled()
    expect(mockNativeListener.current).not.toBeNull()
    expect(Geolocation.watchPosition).not.toHaveBeenCalled()

    // A precise fused reading is uploaded as is — no second request per point.
    mockNativeListener.current!(fix(40.41, t0, 9))
    await flush(); await flush()
    expect(mockSent.map((point) => point.latitude)).toEqual([40.41])
    expect(Geolocation.getCurrentPosition).not.toHaveBeenCalled()

    // Bursts while driving do not become a point every five seconds.
    mockNativeListener.current!(fix(40.42, t0 + 5_000, 8))
    await flush()
    expect(mockSent).toHaveLength(1)

    mockNativeListener.current!(fix(40.43, t0 + 31_000, 8))
    await flush(); await flush()
    expect(mockSent.map((point) => point.latitude)).toEqual([40.41, 40.43])

    const stopping = stopTracking()
    await new Promise((resolve) => setTimeout(resolve, 3_100))
    await stopping
    expect(mockStop).toHaveBeenCalled()
    expect(mockNativeListener.current).toBeNull()
  }, 10_000)

  it("keeps the JS watch as the fallback and registers the native module", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../../src/services/location.android.ts"), "utf8")
    expect(source).toContain("if (startNativeStream()) return")
    expect(source).toContain("startWatching()")
    const pkg = fs.readFileSync(path.resolve(__dirname, "../../android/app/src/main/java/com/mtmobileapp/PresentationFilesPackage.kt"), "utf8")
    expect(pkg).toContain("FieldLocationModule(reactContext)")
    const module = fs.readFileSync(path.resolve(__dirname, "../../android/app/src/main/java/com/mtmobileapp/FieldLocationModule.kt"), "utf8")
    expect(module).toContain("Priority.PRIORITY_HIGH_ACCURACY")
    expect(module).toContain("setMinUpdateDistanceMeters(0f)")
    // No permission of its own: the module answers false and JS falls back.
    expect(module).toContain("if (!hasPermission()) {")
  })
})
