import { planningTodayKey } from "./manager-planning"
import type { AttendanceInput, AttendanceRequest } from "./attendance-contract"
import type { OutboxOperation } from "./outbox"

/**
 * A workday left open since an earlier day.
 *
 * Owner's phone, 2026-10-18 04:06: «İş günü davam edir — 13 oktyabr, 10:21-da
 * başlayıb». The day was started on 13 October and never closed; five days
 * later the card still read as a day at work, with «Fasilə» and «Günü bitir».
 * «Günü bitir» there writes every hour since 13 October into one workday, and
 * while that day is open the server refuses to start a new one, so the report
 * shows the days after it as absences. Asked, the owner chose: a red card, and
 * a button that asks for the real finish time — a time-correction request the
 * manager approves (leaddrive-v2 `applyAttendanceTimeCorrectionInTransaction`).
 * Nothing closes the day by itself: the employee closes their own shift (owner,
 * 2026-09-21).
 *
 * Stale = started on an earlier calendar day of the company AND more than
 * {@link STALE_WORKDAY_HOURS} hours ago. The second half keeps a night shift
 * (22:00 → 06:00) an ordinary working day after midnight; it is the line the
 * server's own «left open» state uses (leaddrive-v2 `workday-open-anomaly.ts`).
 * Days are the company's (bootstrap timezone), the phone's when it has none —
 * the same rule as a visit left open (`stale-visit.ts`).
 */
export const STALE_WORKDAY_HOURS = 16

/** The day a still-open workday was started, when it is stale; else null. */
export function workdayOpenSinceEarlierDay(
  startedAt: string | null | undefined,
  now = new Date(),
  timezone?: string | null,
): string | null {
  if (!startedAt) return null
  const at = new Date(startedAt)
  if (Number.isNaN(at.getTime())) return null
  if (now.getTime() - at.getTime() <= STALE_WORKDAY_HOURS * 3_600_000) return null
  const day = planningTodayKey(at, timezone)
  return day < planningTodayKey(now, timezone) ? day : null
}

/**
 * "HH:mm" on the company's clock. The request form and the server both read
 * the times in the company's timezone, so the phone's own zone must not leak in.
 */
export function companyClock(at: Date, timezone?: string | null): string {
  if (timezone) {
    try {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).formatToParts(at)
      const hour = parts.find((part) => part.type === "hour")?.value
      const minute = parts.find((part) => part.type === "minute")?.value
      if (hour && minute) return `${hour}:${minute}`
    } catch {
      // An unknown zone falls back to the phone's clock, as planningTodayKey does.
    }
  }
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`
}

/** What «Указать время ухода» hands to the request form. */
export type StaleWorkdayCorrection = { workDate: string; startTime: string }

/** Route params of the own-requests screen. */
export type AttendanceRequestsParams = { correction?: StaleWorkdayCorrection }

export function staleWorkdayCorrection(
  startedAt: string,
  timezone?: string | null,
): StaleWorkdayCorrection {
  const at = new Date(startedAt)
  return { workDate: planningTodayKey(at, timezone), startTime: companyClock(at, timezone) }
}

/**
 * The request form, filled in: kind, the day and its start. The finish time is
 * left empty — only the employee knows it, and the form refuses to send
 * without it. The end date starts as the work date; a night shift moves it.
 */
export function staleWorkdayCorrectionDraft(
  correction: StaleWorkdayCorrection,
  clientRequestId: string,
  reason: string,
): AttendanceInput {
  return {
    clientRequestId,
    kind: "TIME_CORRECTION",
    unit: "HOURS",
    startDate: correction.workDate,
    endDate: correction.workDate,
    startTime: correction.startTime,
    endTime: "",
    reason,
    attachmentIds: [],
  }
}

/**
 * Has the finish time for this day already been sent? A request waiting for
 * the manager, one he approved before the phone saw the day closed, or one
 * still in this phone's queue (sent or refused — the requests screen shows
 * which). The server takes one pending correction per day; offering the
 * button again would only queue a refusal.
 */
export function staleWorkdayCorrectionSent(
  workDate: string,
  requests: readonly AttendanceRequest[],
  queued: readonly OutboxOperation[],
): boolean {
  return requests.some((request) => request.details.kind === "TIME_CORRECTION"
    && (request.status === "PENDING" || request.status === "APPROVED")
    && String(request.startDate).slice(0, 10) === workDate)
    || queued.some((operation) => operation.entity === "attendanceRequests" && operation.op === "create"
      && operation.data.kind === "TIME_CORRECTION" && String(operation.data.startDate).slice(0, 10) === workDate)
}
