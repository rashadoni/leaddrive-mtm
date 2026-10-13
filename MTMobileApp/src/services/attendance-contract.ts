/** Mobile mirror of the narrow attendance API. No withdrawn HRM surface. */
export const ATTENDANCE_KINDS = ["ANNUAL_LEAVE", "SICK_LEAVE", "TIME_OFF", "HOURLY_ABSENCE", "BUSINESS_TRIP", "REMOTE_WORK", "OVERTIME", "TIME_CORRECTION"] as const
export type AttendanceKind = typeof ATTENDANCE_KINDS[number]
export type AttendanceInput = {
  clientRequestId: string; kind: AttendanceKind; unit: "DAYS" | "HOURS"
  startDate: string; endDate: string; startTime?: string; endTime?: string
  reason: string; attachmentIds: string[]
}
export type AttendanceRequest = {
  id: string; clientRequestId: string; status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"
  startDate: string; endDate: string; reason: string; submittedAt: string
  decisionNote: string | null; decidedAt: string | null; cancelledAt: string | null; version: string
  details: { kind: AttendanceKind; unit: "DAYS" | "HOURS"; startTime: string | null; endTime: string | null; timezone: string; attachmentIds: string[] }
}
export type AttendanceQuota = {
  month: string; limits: { version: string | null; monthlyMinutes: number; monthlyRequests: number }
  usedMinutes: number; usedRequests: number; remainingMinutes: number; remainingRequests: number
}
export type AttendanceDocument = { clientAttachmentId: string; path: string; scopeKey: string; uploadedId?: string }
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
/** Opaque deduplication identity, not an authentication secret. Persist before sending. */
export function attendanceUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, char => {
    const value = Math.floor(Math.random() * 16)
    return (char === "x" ? value : (value & 3) | 8).toString(16)
  })
}
export function attendanceDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
export function attendanceNeedsHours(kind: AttendanceKind): boolean {
  return ["HOURLY_ABSENCE", "OVERTIME", "TIME_CORRECTION"].includes(kind)
}
export function validAttendanceInput(input: AttendanceInput): boolean {
  if (!UUID_PATTERN.test(input.clientRequestId) || !ATTENDANCE_KINDS.includes(input.kind)
    || !attendanceDate(input.startDate) || !attendanceDate(input.endDate) || input.endDate < input.startDate
    || new Date(`${input.endDate}T00:00Z`).getTime() - new Date(`${input.startDate}T00:00Z`).getTime() > 365 * 86_400_000
    || input.reason.trim().length < 3 || input.reason.trim().length > 1000
    || input.attachmentIds.length > 3 || input.attachmentIds.some(id => !UUID_PATTERN.test(id)) || new Set(input.attachmentIds).size !== input.attachmentIds.length) return false
  if (input.unit === "HOURS") return input.startDate === input.endDate
    && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.startTime ?? "")
    && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.endTime ?? "") && input.endTime! > input.startTime!
  return input.unit === "DAYS" && !input.startTime && !input.endTime && !attendanceNeedsHours(input.kind)
}
export function attendanceErrorKey(error: unknown): string {
  const code = typeof error === "string" ? error : (error as { code?: string })?.code
  if (code?.includes("MINUTES_LIMIT") || code?.includes("COUNT_LIMIT")) return "attendanceRequests.quotaExceeded"
  if (code?.includes("OVERLAP")) return "attendanceRequests.overlap"
  if (code?.includes("ALREADY_DECIDED") || code?.includes("CHANGED")) return "attendanceRequests.changed"
  if (code?.includes("LOCAL_TIME_INVALID")) return "attendanceRequests.localTimeInvalid"
  if (code?.includes("CORRECTION")) return "attendanceRequests.correctionFailed"
  if (code?.includes("DOCUMENT")) return "attendanceRequests.documentFailed"
  if (code?.includes("DISABLED") || code?.includes("SELF_REQUIRED")) return "attendanceRequests.unavailable"
  return "attendanceRequests.failed"
}
