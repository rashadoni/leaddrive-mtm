import { NativeModules } from "react-native"
import { consumeOpenedPushTarget, timeRouteForPushTarget } from "../../src/attendance/push-open"

// Owner, 2026-11-03: an explanation request from HR arrived in Time without a
// notification, «надо посмотреть, откроется ли та страница».
describe("Time notification taps", () => {
  afterEach(() => { delete (NativeModules as Record<string, unknown>).FieldPush })

  it("leads an explanation request and a decided request to their tabs and nothing else anywhere", () => {
    expect(timeRouteForPushTarget("AttendanceExplanations")).toBe("OwnExplanations")
    expect(timeRouteForPushTarget("AttendanceRequests")).toBe("OwnRequests")
    for (const target of ["Messages", "Route", "Approvals", "Tasks", "toString", "__proto__", "", null, undefined, 7])
      expect(timeRouteForPushTarget(target)).toBeNull()
  })

  it("reads the opening notification's target once from the native module", async () => {
    const consumeOpenedTarget = jest.fn().mockResolvedValueOnce("AttendanceExplanations").mockResolvedValueOnce(null)
    ;(NativeModules as Record<string, unknown>).FieldPush = { consumeOpenedTarget }
    await expect(consumeOpenedPushTarget()).resolves.toBe("AttendanceExplanations")
    await expect(consumeOpenedPushTarget()).resolves.toBeNull()
    expect(consumeOpenedTarget).toHaveBeenCalledTimes(2)
  })

  it("is silent where the native side is missing or fails", async () => {
    await expect(consumeOpenedPushTarget()).resolves.toBeNull()
    ;(NativeModules as Record<string, unknown>).FieldPush = { consumeOpenedTarget: jest.fn().mockRejectedValue(new Error("no activity")) }
    await expect(consumeOpenedPushTarget()).resolves.toBeNull()
    ;(NativeModules as Record<string, unknown>).FieldPush = { consumeOpenedTarget: jest.fn().mockResolvedValue(42) }
    await expect(consumeOpenedPushTarget()).resolves.toBeNull()
  })
})
