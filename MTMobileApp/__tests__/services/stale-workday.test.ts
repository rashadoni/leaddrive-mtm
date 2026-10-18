import {
  companyClock,
  staleWorkdayCorrection,
  staleWorkdayCorrectionDraft,
  staleWorkdayCorrectionSent,
  workdayOpenSinceEarlierDay,
} from "../../src/services/stale-workday"
import { validAttendanceInput, type AttendanceRequest } from "../../src/services/attendance-contract"
import type { OutboxOperation } from "../../src/services/outbox"

/**
 * Owner's phone, 2026-10-18 04:06 in Baku: «İş günü davam edir — 13 oktyabr,
 * 10:21-da başlayıb». The production row: started 2026-10-13 06:21:58 UTC,
 * still STARTED five days later.
 */
describe("a workday left open since an earlier day", () => {
  const baku = "Asia/Baku"
  const started = "2026-10-13T06:21:58.533Z" // 10:21 in Baku
  const sunday = new Date("2026-10-18T00:06:00Z") // 04:06 in Baku

  it("is the 13 October day on the morning of the 18th", () => {
    expect(workdayOpenSinceEarlierDay(started, sunday, baku)).toBe("2026-10-13")
  })

  it("stays an ordinary day while it is today's, however long", () => {
    // 00:30 → 23:30 the same Baku day: 23 hours, still today.
    expect(workdayOpenSinceEarlierDay("2026-10-12T20:30:00Z", new Date("2026-10-13T19:30:00Z"), baku)).toBeNull()
  })

  it("lets a night shift run past midnight", () => {
    // 22:00 → 02:00 in Baku: an earlier date, but four hours of work.
    expect(workdayOpenSinceEarlierDay("2026-10-13T18:00:00Z", new Date("2026-10-13T22:00:00Z"), baku)).toBeNull()
    // The same start sixteen hours and a minute later is a day left open.
    expect(workdayOpenSinceEarlierDay("2026-10-13T18:00:00Z", new Date("2026-10-14T10:01:00Z"), baku)).toBe("2026-10-13")
  })

  it("reads the dates on the company's calendar, not UTC", () => {
    // 21:00 UTC on the 12th is 01:00 on the 13th in Baku.
    expect(workdayOpenSinceEarlierDay("2026-10-12T21:00:00Z", sunday, baku)).toBe("2026-10-13")
  })

  it("says nothing it cannot read", () => {
    expect(workdayOpenSinceEarlierDay(null, sunday, baku)).toBeNull()
    expect(workdayOpenSinceEarlierDay("not a date", sunday, baku)).toBeNull()
  })
})

describe("«Указать время ухода» fills the correction request in", () => {
  const baku = "Asia/Baku"

  it("with the day and the start on the company's clock", () => {
    expect(companyClock(new Date("2026-10-13T06:21:58.533Z"), "Asia/Baku")).toBe("10:21")
    expect(staleWorkdayCorrection("2026-10-13T06:21:58.533Z", baku)).toEqual({ workDate: "2026-10-13", startTime: "10:21" })
  })

  it("leaves the finish to the employee — the form refuses to send without it", () => {
    const draft = staleWorkdayCorrectionDraft(
      { workDate: "2026-10-13", startTime: "10:21" },
      "c01be938-a8bb-41e1-b08b-d1ea2394d0b3",
      "Рабочий день не был закрыт вовремя",
    )
    expect(draft).toMatchObject({ kind: "TIME_CORRECTION", unit: "HOURS", startDate: "2026-10-13", endDate: "2026-10-13", startTime: "10:21", endTime: "" })
    expect(validAttendanceInput(draft)).toBe(false)
    expect(validAttendanceInput({ ...draft, endTime: "22:19" })).toBe(true)
    // A night shift ends the next day; the form allows it for a correction.
    expect(validAttendanceInput({ ...draft, endDate: "2026-10-14", endTime: "02:00" })).toBe(true)
  })
})

describe("a finish time already sent is not asked for again", () => {
  const request = (patch: Partial<AttendanceRequest> & { kind?: AttendanceRequest["details"]["kind"] } = {}): AttendanceRequest => {
    const { kind = "TIME_CORRECTION", ...rest } = patch
    return {
      id: "fictional-request", clientRequestId: "c01be938-a8bb-41e1-b08b-d1ea2394d0b3", status: "PENDING",
      startDate: "2026-10-13", endDate: "2026-10-13", reason: "Fictional", submittedAt: "2026-10-18T00:10:00Z",
      decisionNote: null, decidedAt: null, cancelledAt: null, version: "1",
      details: { kind, unit: "HOURS", startTime: "10:21", endTime: "22:19", timezone: "Asia/Baku", attachmentIds: [] },
      ...rest,
    }
  }
  const queued = (data: Record<string, unknown>, status: OutboxOperation["status"] = "pending"): OutboxOperation => ({
    operationId: "fictional-operation", entity: "attendanceRequests", op: "create", data,
    clientTimestamp: 0, attempts: 0, nextAttemptAt: 0, scopeKey: "fictional-org:fictional-agent", status,
  })

  it("counts a request waiting for the manager, or approved before the phone saw the day close", () => {
    expect(staleWorkdayCorrectionSent("2026-10-13", [request()], [])).toBe(true)
    expect(staleWorkdayCorrectionSent("2026-10-13", [request({ status: "APPROVED" })], [])).toBe(true)
  })

  it("offers the button again after a refusal or a cancellation", () => {
    expect(staleWorkdayCorrectionSent("2026-10-13", [request({ status: "REJECTED" })], [])).toBe(false)
    expect(staleWorkdayCorrectionSent("2026-10-13", [request({ status: "CANCELLED" })], [])).toBe(false)
  })

  it("looks only at a time correction for that very day", () => {
    expect(staleWorkdayCorrectionSent("2026-10-13", [request({ startDate: "2026-10-12" })], [])).toBe(false)
    expect(staleWorkdayCorrectionSent("2026-10-13", [request({ kind: "HOURLY_ABSENCE" })], [])).toBe(false)
  })

  it("counts one still in the phone's queue, sent or refused", () => {
    expect(staleWorkdayCorrectionSent("2026-10-13", [], [queued({ kind: "TIME_CORRECTION", startDate: "2026-10-13" })])).toBe(true)
    expect(staleWorkdayCorrectionSent("2026-10-13", [], [queued({ kind: "TIME_CORRECTION", startDate: "2026-10-13" }, "conflict")])).toBe(true)
    expect(staleWorkdayCorrectionSent("2026-10-13", [], [queued({ kind: "SICK_LEAVE", startDate: "2026-10-13" })])).toBe(false)
  })
})
