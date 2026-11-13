/**
 * Owner, 2026-11-13: «нажимаешь начать визит и закончить — очень долго
 * загрузка, секунд 6». Every press waited for a NEW satellite fix. Now a fix
 * the phone already has — tracking's, or one kept warm while the visit button
 * is on screen — is taken at once when it is young and precise enough, and
 * only without one does the press wait as before.
 */
import fs from "fs"
import path from "path"

const mockLocation: { lastKnownPosition: null | { latitude: number; longitude: number; accuracy: number; timestamp: number } } = { lastKnownPosition: null }
jest.mock("../../src/services/location", () => mockLocation)

const mockGetCurrentPosition = jest.fn()
const mockWatchPosition = jest.fn()
jest.mock("@react-native-community/geolocation", () => ({
  getCurrentPosition: (...args: unknown[]) => mockGetCurrentPosition(...args),
  watchPosition: (...args: unknown[]) => mockWatchPosition(...args),
  clearWatch: jest.fn(),
}))

import {
  VISIT_FIX_MAX_AGE_MS,
  forgetVisitFix,
  readVisitPosition,
  recentVisitFix,
  rememberVisitFix,
  warmVisitPosition,
} from "../../src/services/visit-position"

const NOW = new Date("2026-11-13T10:00:00.000Z").getTime()
const fix = (latitude: number, accuracy = 12) => ({ coords: { latitude, longitude: 49.85, accuracy } })

beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(NOW)
  mockGetCurrentPosition.mockReset()
  mockWatchPosition.mockReset()
  mockLocation.lastKnownPosition = null
  forgetVisitFix()
})
afterEach(() => {
  jest.useRealTimers()
})

describe("a visit press takes a fix the phone already has", () => {
  it("answers at once from tracking's last position when it is young, without asking the satellites", async () => {
    mockLocation.lastKnownPosition = { latitude: 40.41, longitude: 49.85, accuracy: 20, timestamp: NOW - 10_000 }
    await expect(readVisitPosition(15000)).resolves.toEqual({ latitude: 40.41, longitude: 49.85 })
    expect(mockGetCurrentPosition).not.toHaveBeenCalled()
  })

  it("prefers the youngest of the warm fix and tracking's", () => {
    mockLocation.lastKnownPosition = { latitude: 40.1, longitude: 49.85, accuracy: 20, timestamp: NOW - 12_000 }
    rememberVisitFix(fix(40.2), NOW - 3_000)
    expect(recentVisitFix(NOW)?.latitude).toBe(40.2)
  })

  it("asks the phone as before when what it has is too old, too rough or nowhere", async () => {
    mockLocation.lastKnownPosition = { latitude: 40.41, longitude: 49.85, accuracy: 20, timestamp: NOW - VISIT_FIX_MAX_AGE_MS - 1 }
    rememberVisitFix(fix(40.5, 400), NOW - 1_000) // 400 m is not where he stands
    expect(recentVisitFix(NOW)).toBeNull()
    rememberVisitFix({ coords: { latitude: 0, longitude: 0, accuracy: 5 } }, NOW)
    expect(recentVisitFix(NOW)).toBeNull()

    mockGetCurrentPosition.mockImplementation((ok: (position: unknown) => void) => ok(fix(40.6)))
    await expect(readVisitPosition(15000)).resolves.toEqual({ latitude: 40.6, longitude: 49.85 })
    expect(mockGetCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 })
    // That reading is now the warm one: the next press takes it at once.
    mockGetCurrentPosition.mockClear()
    await expect(readVisitPosition(10000)).resolves.toEqual({ latitude: 40.6, longitude: 49.85 })
    expect(mockGetCurrentPosition).not.toHaveBeenCalled()
  })

  it("still fails as before when the phone has nothing and cannot read", async () => {
    mockGetCurrentPosition.mockImplementation((_ok: unknown, fail: (error: unknown) => void) => fail(new Error("timeout")))
    await expect(readVisitPosition(10000)).rejects.toThrow("timeout")
  })
})

describe("the warm fix while a visit button is on screen", () => {
  it("reads one-shot in a loop — never the module's single watch — and stops when told", () => {
    mockGetCurrentPosition.mockImplementation((ok: (position: unknown) => void) => ok(fix(40.7)))
    const stop = warmVisitPosition(8_000)
    expect(mockGetCurrentPosition).toHaveBeenCalledTimes(1)
    expect(recentVisitFix()?.latitude).toBe(40.7)

    jest.advanceTimersByTime(8_000)
    expect(mockGetCurrentPosition).toHaveBeenCalledTimes(2)
    stop()
    jest.advanceTimersByTime(60_000)
    expect(mockGetCurrentPosition).toHaveBeenCalledTimes(2)
    expect(mockWatchPosition).not.toHaveBeenCalled()
  })

  it("keeps trying after a failed reading, one at a time", () => {
    mockGetCurrentPosition.mockImplementation((_ok: unknown, fail: () => void) => fail())
    const stop = warmVisitPosition(8_000)
    jest.advanceTimersByTime(7_999)
    expect(mockGetCurrentPosition).toHaveBeenCalledTimes(1)
    jest.advanceTimersByTime(1)
    expect(mockGetCurrentPosition).toHaveBeenCalledTimes(2)
    stop()
  })
})

describe("the screens", () => {
  const read = (file: string) => fs.readFileSync(path.join(__dirname, "../../src", file), "utf8")

  it("start, end and photograph a visit through the quick reading, and keep it warm", () => {
    for (const file of ["screens/route/RouteScreen.tsx", "screens/visit/VisitScreen.tsx"]) {
      const screen = read(file)
      expect(screen).toContain("useWarmVisitPosition(screenFocused && ")
      expect(screen).toContain("prefetchJointManagersForCheckIn()")
      // No press waits on a hand-rolled high-accuracy reading with a 5 s cache any more.
      expect(screen).not.toContain("{ enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }")
      expect(screen).not.toContain("{ enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }")
    }
    expect(read("screens/route/RouteScreen.tsx").match(/await readVisitPosition\(/g)).toHaveLength(3)
    expect(read("screens/visit/VisitScreen.tsx").match(/await readVisitPosition\(/g)).toHaveLength(3)
  })
})
