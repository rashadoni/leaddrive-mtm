/**
 * «Дать задачу» on the manager's phone (owner, 2026-10-20: «чтоб была
 * возможность создавать задачи менеджерам через приложение»; mockup approved
 * with «Давай»): whom, what, which day. The server turns the day into the
 * deadline by the panel's rule (18:00 of that day, company time), so the
 * phone sends only the choice.
 */

export type ManagerTaskDue = "today" | "tomorrow" | "none" | string

export type GiveTaskFailure = "notYourTeam" | "dayPassed" | "invalid" | "offline" | "session" | "failed"

const SERVER_CODES: Record<string, GiveTaskFailure> = {
  MTM_TASK_SCOPE_DENIED: "notYourTeam",
  MTM_MOBILE_PERMISSION_REQUIRED: "notYourTeam",
  MTM_TASK_DUE_IN_PAST: "dayPassed",
  MTM_TASK_INVALID: "invalid",
}

export function giveTaskFailure(error: unknown): GiveTaskFailure {
  const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined
  if (typeof code === "string" && SERVER_CODES[code]) return SERVER_CODES[code]
  const message = error instanceof Error ? error.message : ""
  if (message === "SESSION_EXPIRED") return "session"
  if (message === "REQUEST_TIMEOUT" || message === "Network request failed" || message === "ABORTED") return "offline"
  return "failed"
}

/** What the server said back: the task, and whether the pop-up could reach the phone. */
export function toGivenTask(raw: unknown): { taskId: string | null; pushReady: boolean | null } {
  const data = raw && typeof raw === "object" ? (raw as { data?: unknown }).data : null
  const record = data && typeof data === "object" ? data as { task?: { id?: unknown }; pushReady?: unknown } : {}
  return {
    taskId: typeof record.task?.id === "string" ? record.task.id : null,
    pushReady: typeof record.pushReady === "boolean" ? record.pushReady : null,
  }
}

function shiftDay(dayKey: string, days: number): string {
  const date = new Date(`${dayKey}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** «Дата…»: the two weeks after tomorrow, today and tomorrow having their own buttons. */
export function laterDays(todayKey: string, count = 14): string[] {
  return Array.from({ length: count }, (_, index) => shiftDay(todayKey, index + 2))
}

/** One line of text, as the server keeps it: no surrounding spaces, at most 200 characters. */
export function taskText(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 200)
}
