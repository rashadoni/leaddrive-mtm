/**
 * Relative due-date quick-set for the task editor (SWM-14). A pure, native-dep-
 * free alternative to a date picker: the manager picks a relative option and we
 * compute an ISO timestamp. Times are set to local noon so the displayed
 * calendar day never shifts across a timezone boundary.
 */
export type DueOption = "today" | "tomorrow" | "plus3" | "week" | "month" | "clear"

export const DUE_OPTIONS: readonly DueOption[] = ["today", "tomorrow", "plus3", "week", "month", "clear"]

/** i18n keys for each option label. */
export const DUE_OPTION_KEY: Record<DueOption, string> = {
  today: "task.dueToday",
  tomorrow: "task.dueTomorrow",
  plus3: "task.duePlus3",
  week: "task.dueWeek",
  month: "task.dueMonth",
  clear: "task.dueClear",
}

/** Returns an ISO timestamp for the chosen option, or null to clear the due date. */
export function computeDueDate(option: DueOption, now: Date = new Date()): string | null {
  if (option === "clear") return null
  const d = new Date(now)
  d.setHours(12, 0, 0, 0)
  switch (option) {
    case "today":
      break
    case "tomorrow":
      d.setDate(d.getDate() + 1)
      break
    case "plus3":
      d.setDate(d.getDate() + 3)
      break
    case "week":
      d.setDate(d.getDate() + 7)
      break
    case "month":
      d.setMonth(d.getMonth() + 1)
      break
  }
  return d.toISOString()
}
