import { planningTodayKey } from "./manager-planning"
import type { AttendanceInput, AttendanceRequest } from "./attendance-contract"
import type { OutboxOperation } from "./outbox"

/**
 * A workday left open since an earlier day.
 *
 * Owner's phone, 2026-10-18 04:06: «İş günü davam edir — 13 oktyabr,
 * 10:21-da başlayıb». The day was started on 13 October and never closed; five days
 * later the card still read as a day at work, with «Fasilə» and «Günü bitir».
 * «Günü bitir» there writes every hour since 13 October into one workday, and
 * while that day is open the server refuses to start a new one, so the report
 * shows the days after it as absences. Asked, the owner chose: a red card that
 * closes the day with the real finish time — a time-correction request the
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
 * "HH:mm" on the company's clock. The request and the server both read the
 * times in the company's timezone, so the phone's own zone must not leak in.
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

/** The day and its start, as the close-the-day sheet and the request need them. */
export type StaleWorkdayCorrection = { workDate: string; startTime: string }

export function staleWorkdayCorrection(
  startedAt: string,
  timezone?: string | null,
): StaleWorkdayCorrection {
  const at = new Date(startedAt)
  return { workDate: planningTodayKey(at, timezone), startTime: companyClock(at, timezone) }
}

/** A YYYY-MM-DD key one calendar day later. */
export function nextDayKey(day: string): string {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10)
}

/**
 * What the agent typed into «Во сколько вы закончили?», as "HH:mm". The field
 * is a number pad: "2219", "919", "22:19" and "22.19" all count.
 */
export function normalizeClock(text: string): string | null {
  const match = /^(\d{1,2})[:.]?(\d{2})$/.exec(text.trim())
  if (!match) return null
  const hour = Number(match[1])
  if (hour > 23 || Number(match[2]) > 59) return null
  return `${String(hour).padStart(2, "0")}:${match[2]}`
}

/** The digits as the field shows them: the colon appears once all four are in. */
export function clockFieldText(text: string): string {
  const digits = text.replace(/\D/g, "").slice(0, 4)
  return digits.length === 4 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits
}

export type StaleWorkdayFinish =
  | { ok: true; input: AttendanceInput; nextDay: boolean }
  | { ok: false; error: "format" | "future" }

/**
 * The time-correction request that closes the day at the finish typed in.
 * A finish at or before the start is after midnight, on the next day — the
 * request may cross midnight once, and the server keeps it within 24 hours.
 * A finish that has not happened yet is refused here, as the server would.
 */
export function staleWorkdayFinishRequest(
  correction: StaleWorkdayCorrection,
  finishText: string,
  now: Date,
  timezone: string | null | undefined,
  clientRequestId: string,
  reason: string,
): StaleWorkdayFinish {
  const endTime = normalizeClock(finishText)
  if (!endTime) return { ok: false, error: "format" }
  const nextDay = endTime <= correction.startTime
  const endDate = nextDay ? nextDayKey(correction.workDate) : correction.workDate
  const today = planningTodayKey(now, timezone)
  if (endDate > today || (endDate === today && endTime > companyClock(now, timezone))) {
    return { ok: false, error: "future" }
  }
  return {
    ok: true,
    nextDay,
    input: {
      clientRequestId,
      kind: "TIME_CORRECTION",
      unit: "HOURS",
      startDate: correction.workDate,
      endDate,
      startTime: correction.startTime,
      endTime,
      reason,
      attachmentIds: [],
    },
  }
}

/**
 * The finish time already sent for that day, or null when there is none to
 * wait for. A request waiting for the manager, one approved before the
 * phone saw the day closed, or one still waiting in this phone's queue. A
 * queued request the server refused does not count: the card offers «Закрыть
 * день» again, and the refusal is in «Мои заявки».
 */
export type StaleWorkdayFinishSent = {
  finish: string
  /**
   * Already approved — by the manager, or at once where the company lets a
   * forgotten day's close through on its own (leaddrive-v2
   * attendance-auto-close.ts). The day is closed on the server; the phone
   * has only to read it again.
   */
  approved: boolean
}

export function staleWorkdayFinishSent(
  workDate: string,
  requests: readonly AttendanceRequest[],
  queued: readonly OutboxOperation[],
): StaleWorkdayFinishSent | null {
  const request = requests.find((row) => row.details.kind === "TIME_CORRECTION"
    && (row.status === "PENDING" || row.status === "APPROVED")
    && String(row.startDate).slice(0, 10) === workDate)
  if (request) return { finish: request.details.endTime ?? "", approved: request.status === "APPROVED" }
  const operation = queued.find((row) => row.entity === "attendanceRequests" && row.op === "create"
    && row.status === "pending" && row.data.kind === "TIME_CORRECTION"
    && String(row.data.startDate).slice(0, 10) === workDate)
  if (operation) return { finish: typeof operation.data.endTime === "string" ? operation.data.endTime : "", approved: false }
  return null
}
