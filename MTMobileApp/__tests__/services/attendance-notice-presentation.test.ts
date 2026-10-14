import { attendanceNoticePresentation } from "../../src/services/attendance-notice-presentation"
import az from "../../src/i18n/locales/az.json"
import ru from "../../src/i18n/locales/ru.json"
import en from "../../src/i18n/locales/en.json"

const id = "00000000-0000-4000-8000-000000000001"
it.each(["APPROVED", "REJECTED", "CANCELLED"])("localizes existing %s metadata without exposing its private fields", status => {
  const result = attendanceNoticePresentation({ domain: "route", attendanceRequestId: id, status, reason: "PRIVATE_REASON", coordinates: [1,2], titleKey: "malicious.key" })
  expect(result).toEqual({ titleKey: `attendanceNotice.${status.toLowerCase()}` })
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE_REASON|00000000|coordinates|malicious/)
})
it.each(["EMPLOYEE_START", "EMPLOYEE_FINISH"])("uses only the known generated %s reminder copy", attendanceReminderKind => {
  expect(attendanceNoticePresentation({ domain: "route", attendanceReminderId: id, attendanceReminderKind })).toEqual({
    titleKey: `attendanceNotice.${attendanceReminderKind === "EMPLOYEE_START" ? "start" : "finish"}Reminder`, bodyKey: "attendanceNotice.reminderBody",
  })
})
it.each([
  undefined, null, [], "APPROVED", { titleKey: "attendanceNotice.approved" },
  { domain: "other", attendanceRequestId: id, status: "APPROVED" },
  { attendanceRequestId: id, status: "APPROVED" },
  { domain: "route", attendanceRequestId: "not-a-uuid", status: "APPROVED" },
  { domain: "route", attendanceRequestId: id, status: "PENDING" },
  { domain: "route", attendanceRequestId: id, status: "approved" },
  { domain: "route", attendanceRequestId: id, status: "APPROVED", attendanceReminderId: id },
  { domain: "route", attendanceRequestId: id, status: "APPROVED", attendanceReminderKind: "EMPLOYEE_START" },
  { domain: "route", attendanceReminderId: id, attendanceReminderKind: "MANAGER_MISSING" },
  { domain: "route", attendanceReminderId: id, attendanceReminderKind: "UNKNOWN" },
  { domain: "route", attendanceReminderId: "", attendanceReminderKind: "EMPLOYEE_START" },
  { domain: "route", attendanceReminderId: id, attendanceReminderKind: "EMPLOYEE_START", status: "APPROVED" },
])("retains original text for unknown, malformed or ambiguous metadata %#", metadata => {
  expect(attendanceNoticePresentation(metadata)).toEqual({})
})
it("provides the same finite nonempty copy in all three app locales", () => {
  const expected = ["approved", "rejected", "cancelled", "startReminder", "finishReminder", "reminderBody"].sort()
  for (const copy of [az.attendanceNotice, ru.attendanceNotice, en.attendanceNotice]) {
    expect(Object.keys(copy).sort()).toEqual(expected)
    for (const value of Object.values(copy)) expect(value.trim().length).toBeGreaterThan(3)
  }
  // APPROVED covers both an approved employee request and a day recorded by HR.
  expect(ru.attendanceNotice.approved).toBe("Изменение учёта подтверждено")
})
