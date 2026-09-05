/**
 * Status dictionary (field UX audit 2026-09-05, M-11 / task B15).
 *
 * Server enum values ("CHECKED_OUT", "AGENT", "WEEKEND") are identifiers, not
 * copy. Every one that reaches the screen goes through here and the
 * `status.*` keys of the three locales; an unknown value renders the neutral
 * "not specified" label instead of the raw identifier. The group lists
 * mirror leaddrive-v2 `src/lib/mtm/status-labels.ts`.
 */
export const STATUS_GROUPS = {
  visit: ["CHECKED_IN", "CHECKED_OUT", "CANCELLED"],
  visitOutcome: ["SUCCESSFUL", "PARTIAL", "NO_CONTACT", "RESCHEDULE"],
  customer: ["ACTIVE", "INACTIVE", "PROSPECT"],
  customerType: ["PHARMACY", "CLINIC", "DOCTOR", "STORE", "OTHER"],
  role: ["ADMIN", "MANAGER", "SUPERVISOR", "AGENT"],
  route: ["DRAFT", "PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "INCOMPLETE"],
  task: ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED", "OVERDUE"],
  dayKind: ["WORKING_DAY", "WEEKEND", "PUBLIC_HOLIDAY", "COMPANY_HOLIDAY", "EXCEPTION_WORKDAY", "MOVED_WORKDAY", "MOVED_DAY_OFF"],
} as const

export type StatusGroup = keyof typeof STATUS_GROUPS

export const STATUS_UNKNOWN_KEY = "status.unknown"

type Translate = (key: string) => string

export function statusKey(group: StatusGroup, value: string | null | undefined): string {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : ""
  return (STATUS_GROUPS[group] as readonly string[]).includes(normalized)
    ? `status.${group}.${normalized}`
    : STATUS_UNKNOWN_KEY
}

/** Translated label for an enum value; never the raw identifier. */
export function statusLabel(t: Translate, group: StatusGroup, value: string | null | undefined): string {
  return t(statusKey(group, value))
}
