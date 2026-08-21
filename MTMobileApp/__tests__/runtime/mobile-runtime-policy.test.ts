import { mobileRuntimePolicy } from "../../src/runtime/mobile-runtime-policy"
import { hasCapability, type MobileCapability } from "../../src/services/bootstrap"

describe("mobileRuntimePolicy", () => {
  test("keeps a logged-in manager online without enabling GPS", () => {
    expect(mobileRuntimePolicy({
      isLoggedIn: true,
      canTrackFieldLocation: false,
      workdayHydrated: true,
      activeWorkdayMatches: false,
    })).toEqual({
      heartbeat: true,
      locationTracking: false,
    })
  })

  test("keeps one-shot manager location sharing out of background tracking", () => {
    const managerCapabilities: MobileCapability[] = ["TEAM_READ", "SELF_LOCATION_SHARE"]
    expect(mobileRuntimePolicy({
      isLoggedIn: true,
      canTrackFieldLocation: hasCapability(managerCapabilities, "FIELD_TRACK"),
      workdayHydrated: true,
      activeWorkdayMatches: true,
    })).toEqual({
      heartbeat: true,
      locationTracking: false,
    })
  })

  test("keeps a logged-in field agent online before the workday starts", () => {
    expect(mobileRuntimePolicy({
      isLoggedIn: true,
      canTrackFieldLocation: true,
      workdayHydrated: true,
      activeWorkdayMatches: false,
    })).toEqual({
      heartbeat: true,
      locationTracking: false,
    })
  })

  test("enables both heartbeat and GPS for an active field workday", () => {
    expect(mobileRuntimePolicy({
      isLoggedIn: true,
      canTrackFieldLocation: true,
      workdayHydrated: true,
      activeWorkdayMatches: true,
    })).toEqual({
      heartbeat: true,
      locationTracking: true,
    })
  })

  test("disables both processes after logout", () => {
    expect(mobileRuntimePolicy({
      isLoggedIn: false,
      canTrackFieldLocation: true,
      workdayHydrated: true,
      activeWorkdayMatches: true,
    })).toEqual({
      heartbeat: false,
      locationTracking: false,
    })
  })
})
