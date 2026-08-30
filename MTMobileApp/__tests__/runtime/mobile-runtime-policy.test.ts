import { mobileRuntimePolicy } from "../../src/runtime/mobile-runtime-policy"

describe("mobileRuntimePolicy", () => {
  test("does not sync before the Route Field manifest confirms access", () => {
    expect(mobileRuntimePolicy({
      isLoggedIn: true,
      routeFieldAccess: "pending",
    })).toEqual({
      heartbeat: false,
      locationTracking: false,
    })
  })

  test("allows the Route Field sync lifecycle after explicit admission", () => {
    expect(mobileRuntimePolicy({
      isLoggedIn: true,
      routeFieldAccess: "enabled",
    })).toEqual({
      heartbeat: true,
      locationTracking: false,
    })
  })

  test("keeps legacy v1 access compatible without enabling background GPS", () => {
    expect(mobileRuntimePolicy({
      isLoggedIn: true,
      routeFieldAccess: "legacy",
    })).toEqual({
      heartbeat: true,
      locationTracking: false,
    })
  })

  test("does not use an HRM-only or disabled account as a location trigger", () => {
    expect(mobileRuntimePolicy({
      isLoggedIn: true,
      routeFieldAccess: "disabled",
    })).toEqual({
      heartbeat: false,
      locationTracking: false,
    })
  })

  test("disables all runtime work after logout", () => {
    expect(mobileRuntimePolicy({
      isLoggedIn: false,
      routeFieldAccess: "enabled",
    })).toEqual({
      heartbeat: false,
      locationTracking: false,
    })
  })
})
