import fs from "fs"
import path from "path"

/**
 * 2026-09-22, the owner's Galaxy S23: two days of driving, not one point on
 * the map, while the notification said data was being sent. The tracking loop
 * slept on a JS timer, and React Native stops JS timers of a backgrounded app
 * when the screen goes dark. Readings now arrive as native events.
 */
type Reading = { coords: { latitude: number; longitude: number; accuracy: number | null; speed: null; heading: null; altitude: null }; timestamp: number }

const mockSent: Array<{ latitude: number; recordedAt: string }> = []
let mockWatch: ((reading: Reading) => void) | null = null
let mockFix: ((success: (fix: Reading) => void, error: () => void) => void) = (_success, error) => error()
let mockRunning = false
let mockTask: ((data: unknown) => Promise<void>) | null = null

jest.mock("react-native-background-actions", () => ({
  __esModule: true,
  default: {
    isRunning: () => mockRunning,
    start: jest.fn(async (task: (data: unknown) => Promise<void>) => { mockRunning = true; mockTask = task; void task({}) }),
    stop: jest.fn(async () => { mockRunning = false }),
  },
}))
jest.mock("@react-native-community/geolocation", () => ({
  __esModule: true,
  default: {
    setRNConfiguration: jest.fn(),
    watchPosition: jest.fn((success: (reading: Reading) => void) => { mockWatch = success; return 7 }),
    clearWatch: jest.fn(() => { mockWatch = null }),
    getCurrentPosition: jest.fn((success: (fix: Reading) => void, error: () => void) => mockFix(success, error)),
  },
}))
jest.mock("../../src/services/api", () => ({
  api: { sendLocation: jest.fn(async (point: { latitude: number; recordedAt: string }) => { mockSent.push(point); return {} }) },
}))
jest.mock("../../src/i18n/index.android", () => ({ i18n: { t: (key: string) => key } }))
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)

import Geolocation from "@react-native-community/geolocation"
import { HEARTBEAT_JITTER_MS, HEARTBEAT_STUCK_MS, isHeartbeatDue, isHeartbeatStuck, SEND_GAP_MS, startTracking, stopTracking } from "../../src/services/location.android"

function reading(latitude: number, timestamp: number, accuracy: number): Reading {
  return { coords: { latitude, longitude: 49.8, accuracy, speed: null, heading: null, altitude: null }, timestamp }
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

describe("GPS tracking without JS timers", () => {
  beforeEach(() => {
    mockSent.length = 0
    mockRunning = false
    mockWatch = null
    mockTask = null
  })

  it("never sleeps on a JS timer between points", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../../src/services/location.android.ts"), "utf8")
    const task = source.slice(source.indexOf("async function backgroundTask("), source.indexOf("/** Minimum spacing"))
    expect(task).not.toMatch(/sleep\(|setTimeout|setInterval/)
    expect(source).not.toContain("pollAndSendAsync")
    expect(source).toContain("Geolocation.watchPosition(")
  })

  it("abandons a heartbeat busy for 90 s on the readings' clock", () => {
    expect(HEARTBEAT_STUCK_MS).toBe(90_000)
    expect(isHeartbeatStuck(1_089_999, 1_000_000)).toBe(false)
    expect(isHeartbeatStuck(1_090_000, 1_000_000)).toBe(true)
  })

  it("is due every 30 s by the readings' own clock, with room for a reading that comes a little early", () => {
    expect(SEND_GAP_MS).toBe(30_000)
    expect(HEARTBEAT_JITTER_MS).toBe(3_000)
    expect(isHeartbeatDue(1_000_000, 0)).toBe(true)
    expect(isHeartbeatDue(1_026_999, 1_000_000)).toBe(false)
    expect(isHeartbeatDue(1_029_800, 1_000_000)).toBe(true)
  })

  // 2026-09-26, the owner's phone: 20 s fused readings, a point every 42 s.
  it.each([
    [15_000, 30_000],
    [10_000, 30_000], // the JS watch fallback
  ])("turns readings every %i ms, jittered by 300 ms, into a point every %i ms", (step, gap) => {
    let lastSent = -Infinity
    const sent: number[] = []
    for (let index = 0; index <= 40; index += 1) {
      const at = index * step + (index % 2 === 0 ? 0 : -300)
      if (isHeartbeatDue(at, lastSent)) {
        sent.push(at)
        lastSent = at
      }
    }
    const gaps = sent.slice(1).map((at, index) => at - sent[index])
    expect(Math.max(...gaps)).toBeLessThanOrEqual(gap + 1_000)
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(gap - 1_000)
  })

  it("sends a precise GPS fix on the heartbeat, else the network reading, and nothing in between", async () => {
    await startTracking()
    expect(mockTask).not.toBeNull()
    expect(Geolocation.watchPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), expect.objectContaining({ enableHighAccuracy: false, distanceFilter: 0 }))

    const t0 = Date.parse("2026-09-22T10:00:00.000Z")
    mockFix = (success) => success(reading(40.5, t0 + 500, 8))
    mockWatch!(reading(40.4, t0, 35))
    await flush(); await flush()
    expect(mockSent.map((point) => point.latitude)).toEqual([40.5])

    // 10 s later: not due, no request at all.
    mockWatch!(reading(40.41, t0 + 10_000, 35))
    await flush()
    expect(mockSent).toHaveLength(1)

    // GPS silent indoors: the network reading goes instead.
    mockFix = (_success, error) => error()
    mockWatch!(reading(40.42, t0 + 31_000, 40))
    await flush(); await flush()
    expect(mockSent.map((point) => point.latitude)).toEqual([40.5, 40.42])

    // A reading too coarse to show on a map is not sent.
    mockWatch!(reading(40.43, t0 + 62_000, 900))
    await flush(); await flush()
    expect(mockSent).toHaveLength(2)

    // 2026-09-24 on the phone: minimised, fetch resolves on a frozen JS timer,
    // so an upload that reached the server never settles. The next point must
    // still go 30 s later — not after the 90 s stuck limit (it was 93–96 s).
    const api = jest.requireMock("../../src/services/api").api as { sendLocation: jest.Mock }
    api.sendLocation.mockImplementationOnce(() => new Promise(() => {}))
    mockFix = (success) => success(reading(40.6, t0 + 93_000, 9))
    mockWatch!(reading(40.44, t0 + 93_000, 30))
    await flush(); await flush()
    expect(mockSent).toHaveLength(2)
    mockFix = (success) => success(reading(40.7, t0 + 123_000, 9))
    mockWatch!(reading(40.45, t0 + 123_000, 30))
    await flush(); await flush()
    expect(mockSent.map((point) => point.latitude)).toEqual([40.5, 40.42, 40.7])

    const stopping = stopTracking()
    await new Promise((resolve) => setTimeout(resolve, 3_100))
    await stopping
    expect(Geolocation.clearWatch).toHaveBeenCalledWith(7)
  }, 10_000)
})
