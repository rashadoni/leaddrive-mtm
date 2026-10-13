import { api } from "./api"
import type { BootstrapWorkday } from "./bootstrap"
import { useWorkdayStore } from "../store/workday"

/**
 * «Вернуться к работе»: the employee comes back to the workday they closed
 * earlier the same day.
 *
 * Owner, 2026-10-13, having closed a day at 10:56 and found no way back: «как
 * теперь обратно включить день?» — and of the rule that forbade it: «думаю,
 * ограничение не имеет смысла, это ничего не предотвращает». One condition
 * stays, by his word: the same calendar day only.
 *
 * The server does the work (leaddrive-v2 `src/lib/mtm/workday-return.ts`): the
 * closure and the return both stay in the journal, and the time between them is
 * a pause, not worked time. This file asks, and tells the device what came back.
 */

/** What the app can say about a return, other than "it failed, try again". */
export type WorkdayReturnOutcome =
  /** The day is running again. */
  | "returned"
  /** The server says the day is not closed: the device was behind, and a refresh shows it open. */
  | "alreadyOpen"
  /** The server's calendar is on another day than the one that was closed. */
  | "notToday"
  /** The day's times were corrected or its timesheet approved: it is no longer the employee's to change. */
  | "locked"

const REFUSALS: Record<string, WorkdayReturnOutcome> = {
  MTM_WORKDAY_RETURN_NOT_COMPLETED: "alreadyOpen",
  MTM_WORKDAY_RETURN_NOT_TODAY: "notToday",
  MTM_WORKDAY_RETURN_LOCKED: "locked",
  // The journal does not reproduce the day as it stands: for the employee
  // that is the same answer — this day is not theirs to reopen.
  MTM_WORKDAY_RETURN_HISTORY_INVALID: "locked",
}

/** Offered only where the server said, in so many words, that it can do it. */
export function canReturnToWorkday(policies: { workdayReturn?: boolean } | null | undefined): boolean {
  return policies?.workdayReturn === true
}

function returnedWorkday(response: unknown): BootstrapWorkday | null {
  const workday = (response as { data?: { workday?: Record<string, unknown> } } | null)?.data?.workday
  if (!workday || typeof workday.id !== "string" || typeof workday.status !== "string" || typeof workday.startedAt !== "string") return null
  return {
    id: workday.id,
    status: workday.status,
    startedAt: workday.startedAt,
    ...(typeof workday.workDate === "string" ? { workDate: workday.workDate } : {}),
    ...(typeof workday.pausedAt === "string" ? { pausedAt: workday.pausedAt } : {}),
    ...(typeof workday.completedAt === "string" ? { completedAt: workday.completedAt } : {}),
  }
}

/**
 * Asks the server to return the employee to `workdayId` and, when it did, shows
 * the day running on this device. A refusal with a reason is an outcome; no
 * answer, or an answer without a reason, throws — the caller says "try again".
 */
export async function returnToClosedWorkday(key: string, workdayId: string, guard?: () => void): Promise<WorkdayReturnOutcome> {
  guard?.()
  // One id per tap. A tap whose answer was lost needs no memory of it: the
  // next one finds the day open and is told so.
  const operationId = "wdr-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10)
  let response: unknown
  try {
    response = guard ? await api.returnToWorkday({ operationId, workdayId }, guard) : await api.returnToWorkday({ operationId, workdayId })
    guard?.()
  } catch (error) {
    guard?.()
    const code = (error as { code?: unknown } | null)?.code
    if (typeof code === "string" && Object.prototype.hasOwnProperty.call(REFUSALS, code)) return REFUSALS[code]
    throw error
  }
  const workday = returnedWorkday(response)
  // The same door the server's shift always comes in by; it also forgets
  // "finished today", which is no longer true.
  if (workday && workday.id !== workdayId) throw new Error('MTM_WORKDAY_RETURN_RESPONSE_INVALID')
  if (workday) await useWorkdayStore.getState().reconcileFromServer(key, workday, guard)
  guard?.()
  return "returned"
}
