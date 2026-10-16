const decisionTitles = {
  APPROVED: "attendanceNotice.approved",
  REJECTED: "attendanceNotice.rejected",
  CANCELLED: "attendanceNotice.cancelled",
} as const
const reminderTitles = {
  EMPLOYEE_START: "attendanceNotice.startReminder",
  EMPLOYEE_FINISH: "attendanceNotice.finishReminder",
} as const
export type AttendanceNoticePresentation = {
  titleKey?: typeof decisionTitles[keyof typeof decisionTitles] | typeof reminderTitles[keyof typeof reminderTitles]
  bodyKey?: "attendanceNotice.reminderBody"
  /** HR asked for (or decided on) an explanation: the card opens «Объяснительные». */
  explanation?: true
}
const uuid = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

/** Presentation only: server ownership/admission remains authoritative. Never
 * accept a translation key or display private fields supplied in metadata.
 * Unknown/legacy notices retain their original text without guessing from it. */
export function attendanceNoticePresentation(metadata: unknown): AttendanceNoticePresentation {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {}
  const value = metadata as Record<string, unknown>
  if (value.domain !== "route") return {}
  // The server writes the title in the employee's language; only the way to answer is added.
  if (uuid(value.attendanceExplanationId) && value.attendanceRequestId === undefined && value.attendanceReminderId === undefined) return { explanation: true }
  if (uuid(value.attendanceRequestId) && value.attendanceReminderId === undefined && value.attendanceReminderKind === undefined) {
    if (value.status === "APPROVED" || value.status === "REJECTED" || value.status === "CANCELLED") {
      // HR-recorded days share the APPROVED request status. The copy describes
      // the confirmed attendance record, without claiming who submitted it.
      return { titleKey: decisionTitles[value.status] }
    }
  }
  if (uuid(value.attendanceReminderId) && value.attendanceRequestId === undefined && value.status === undefined) {
    if (value.attendanceReminderKind === "EMPLOYEE_START" || value.attendanceReminderKind === "EMPLOYEE_FINISH") {
      return { titleKey: reminderTitles[value.attendanceReminderKind], bodyKey: "attendanceNotice.reminderBody" }
    }
  }
  return {}
}
