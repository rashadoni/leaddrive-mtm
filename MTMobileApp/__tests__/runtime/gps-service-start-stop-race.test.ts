import fs from "fs"
import path from "path"

/**
 * 2026-09-14, Galaxy S23: the notification sheet closed, the tracking effect
 * ran again, and the earlier run stopped the GPS service 14 ms after starting
 * it. Android kills the app for that
 * (ForegroundServiceDidNotStartInTimeException). Starts and stops now share
 * one queue, and a stop waits until the service had time to come up.
 */
const mockEvents: string[] = []
let mockRunning = false

jest.mock("react-native-background-actions", () => ({
  __esModule: true,
  default: {
    isRunning: () => mockRunning,
    start: jest.fn(async () => { mockEvents.push("start"); mockRunning = true }),
    stop: jest.fn(async () => { mockEvents.push("stop"); mockRunning = false }),
  },
}))
jest.mock("@react-native-community/geolocation", () => ({
  __esModule: true,
  default: { setRNConfiguration: jest.fn(), getCurrentPosition: jest.fn() },
}))
jest.mock("../../src/services/api", () => ({ api: { sendLocation: jest.fn(async () => ({})) } }))
jest.mock("../../src/i18n/index.android", () => ({ i18n: { t: (key: string) => key } }))

import { startTracking, stopTracking } from "../../src/services/location.android"

describe("GPS foreground service start/stop", () => {
  beforeEach(() => {
    mockEvents.length = 0
    mockRunning = false
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] })
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it("does not stop the service before it has had time to come up", async () => {
    await startTracking()
    const stopping = stopTracking()
    await jest.advanceTimersByTimeAsync(2_900)
    expect(mockEvents).toEqual(["start"])
    await jest.advanceTimersByTimeAsync(200)
    await stopping
    expect(mockEvents).toEqual(["start", "stop"])
  })

  it("keeps one service when a second start arrives while one is starting", async () => {
    await Promise.all([startTracking(), startTracking()])
    expect(mockEvents).toEqual(["start"])
    const stopping = stopTracking()
    await jest.advanceTimersByTimeAsync(3_000)
    await stopping
  })

  it("the tracking effect no longer stops right after its own start", () => {
    const app = fs.readFileSync(path.resolve(__dirname, "../../src/runtime/AndroidApp.tsx"), "utf8")
    const run = app.slice(app.indexOf("setTrackingWorkdayId(latestWorkdayId)"), app.indexOf("})().catch(() => {})", app.indexOf("setTrackingWorkdayId(latestWorkdayId)")))
    expect(run).toContain("await startTracking()")
    expect(run).not.toContain("stopTracking")
  })
})
