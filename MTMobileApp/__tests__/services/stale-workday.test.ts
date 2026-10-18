import {
  clockFieldText,
  companyClock,
  normalizeClock,
  staleWorkdayCorrection,
  staleWorkdayFinishRequest,
  staleWorkdayFinishSent,
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

describe("«Günü bağla» asks only for the finish time", () => {
  const baku = "Asia/Baku"
  const correction = { workDate: "2026-10-13", startTime: "10:21" }
  const sunday = new Date("2026-10-18T00:06:00Z") // 04:06 in Baku
  const id = "c01be938-a8bb-41e1-b08b-d1ea2394d0b3"
  const reason = "İş günü vaxtında bağlanmayıb"

  it("knows the day and its start on the company's clock", () => {
    expect(companyClock(new Date("2026-10-13T06:21:58.533Z"), baku)).toBe("10:21")
    expect(staleWorkdayCorrection("2026-10-13T06:21:58.533Z", baku)).toEqual(correction)
  })

  it("reads the number pad however the time is typed", () => {
    expect(normalizeClock("2219")).toBe("22:19")
    expect(normalizeClock("22:19")).toBe("22:19")
    expect(normalizeClock("22.19")).toBe("22:19")
    expect(normalizeClock("919")).toBe("09:19")
    expect(normalizeClock("2519")).toBeNull()
    expect(normalizeClock("2260")).toBeNull()
    expect(normalizeClock("22")).toBeNull()
    expect(clockFieldText("221")).toBe("221")
    expect(clockFieldText("2219")).toBe("22:19")
    expect(clockFieldText("22:1")).toBe("221")
  })

  it("makes the request the form would have made, valid for the server", () => {
    const result = staleWorkdayFinishRequest(correction, "2219", sunday, baku, id, reason)
    expect(result).toEqual({ ok: true, nextDay: false, input: {
      clientRequestId: id, kind: "TIME_CORRECTION", unit: "HOURS", startDate: "2026-10-13", endDate: "2026-10-13",
      startTime: "10:21", endTime: "22:19", reason, attachmentIds: [],
    } })
    expect(result.ok && validAttendanceInput(result.input)).toBe(true)
  })

  it("puts a finish at or before the start after midnight, on the next day", () => {
    const result = staleWorkdayFinishRequest(correction, "0130", sunday, baku, id, reason)
    expect(result.ok && result.nextDay).toBe(true)
    expect(result.ok && result.input.endDate).toBe("2026-10-14")
    expect(result.ok && validAttendanceInput(result.input)).toBe(true)
  })

  it("refuses what is not a time, and a finish that has not happened yet", () => {
    expect(staleWorkdayFinishRequest(correction, "", sunday, baku, id, reason)).toEqual({ ok: false, error: "format" })
    expect(staleWorkdayFinishRequest(correction, "2519", sunday, baku, id, reason)).toEqual({ ok: false, error: "format" })
    // The day before yesterday, opened at 22:00: a finish at 05:00 «today» is still ahead at 04:06.
    const yesterday = { workDate: "2026-10-17", startTime: "22:00" }
    expect(staleWorkdayFinishRequest(yesterday, "0500", sunday, baku, id, reason)).toEqual({ ok: false, error: "future" })
    expect(staleWorkdayFinishRequest(yesterday, "0400", sunday, baku, id, reason).ok).toBe(true)
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

  it("names the time waiting for the manager, or approved before the phone saw the day close", () => {
    expect(staleWorkdayFinishSent("2026-10-13", [request()], [])).toEqual({ finish: "22:19", approved: false })
    expect(staleWorkdayFinishSent("2026-10-13", [request({ status: "APPROVED" })], [])).toEqual({ finish: "22:19", approved: true })
  })

  it("offers «Günü bağla» again after a refusal or a cancellation", () => {
    expect(staleWorkdayFinishSent("2026-10-13", [request({ status: "REJECTED" })], [])).toBeNull()
    expect(staleWorkdayFinishSent("2026-10-13", [request({ status: "CANCELLED" })], [])).toBeNull()
  })

  it("looks only at a time correction for that very day", () => {
    expect(staleWorkdayFinishSent("2026-10-13", [request({ startDate: "2026-10-12" })], [])).toBeNull()
    expect(staleWorkdayFinishSent("2026-10-13", [request({ kind: "HOURLY_ABSENCE" })], [])).toBeNull()
  })

  it("counts one still waiting in the phone's queue, but not one the server refused", () => {
    expect(staleWorkdayFinishSent("2026-10-13", [], [queued({ kind: "TIME_CORRECTION", startDate: "2026-10-13", endTime: "22:19" })])).toEqual({ finish: "22:19", approved: false })
    expect(staleWorkdayFinishSent("2026-10-13", [], [queued({ kind: "TIME_CORRECTION", startDate: "2026-10-13", endTime: "22:19" }, "conflict")])).toBeNull()
    expect(staleWorkdayFinishSent("2026-10-13", [], [queued({ kind: "SICK_LEAVE", startDate: "2026-10-13" })])).toBeNull()
  })
})
