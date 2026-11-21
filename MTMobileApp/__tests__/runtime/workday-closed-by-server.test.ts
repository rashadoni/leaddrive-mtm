import fs from "fs"
import path from "path"

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)

import { pointOutsideOpenDay } from "../../src/services/location-outbox"

/**
 * Client, 2026-11-21: a day left open must not record the agent until morning.
 * The server closes it at the company's hour and refuses later points. The
 * phone has to stop by itself, in the background, where JS timers stand still.
 */
const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8")
const PUSH = "android/app/src/main/java/com/mtmobileapp/FieldPushService.kt"

describe("a day closed on the server ends tracking on the phone", () => {
  const refused = { status: 409, code: "MTM_LOCATION_OUTSIDE_WORKDAY" }

  it("asks the server again only for a point of the day being recorded", () => {
    expect(pointOutsideOpenDay(refused, "day-1", "day-1")).toBe(true)
    expect(pointOutsideOpenDay(refused, "day-old", "day-1")).toBe(false)
    expect(pointOutsideOpenDay(refused, undefined, "day-1")).toBe(false)
    expect(pointOutsideOpenDay(refused, "day-1", null)).toBe(false)
  })

  it("does not read another refusal or a network failure as the end of the day", () => {
    expect(pointOutsideOpenDay({ status: 409, code: "MTM_LOCATION_WORKDAY_PAUSED" }, "day-1", "day-1")).toBe(false)
    expect(pointOutsideOpenDay({ status: 500, code: "MTM_LOCATION_OUTSIDE_WORKDAY" }, "day-1", "day-1")).toBe(false)
    expect(pointOutsideOpenDay({ message: "Network request failed" }, "day-1", "day-1")).toBe(false)
    expect(pointOutsideOpenDay(null, "day-1", "day-1")).toBe(false)
  })

  it("the push stops the stream and the service natively, only for the day being recorded", () => {
    const service = read(PUSH)
    expect(service).toContain('WORKDAY_CLOSED_EVENT = "workday_closed"')
    const end = service.slice(service.indexOf("private fun endTrackingOf"), service.indexOf("companion object"))
    expect(end.indexOf("trackedWorkdayId(this) != workdayId")).toBeGreaterThan(-1)
    expect(end.indexOf("trackedWorkdayId(this) != workdayId")).toBeLessThan(end.indexOf("FieldLocationModule.stopStream()"))
    expect(end).toContain("stopService(Intent(this, RNBackgroundActionsTask::class.java))")
    // Before the title check: a push without a title must still stop GPS.
    const received = service.slice(service.indexOf("override fun onMessageReceived"))
    expect(received.indexOf("endTrackingOf")).toBeLessThan(received.indexOf("?: return"))
  })

  it("tells native which day it is recording", () => {
    const location = read("src/services/location.android.ts")
    const remember = location.slice(location.indexOf("function rememberTrackingResume"), location.indexOf("export function forgetTrackingResume"))
    expect(remember).toContain("workdayId: activeTrackingWorkdayId")
  })
})
