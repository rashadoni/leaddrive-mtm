import { api } from "./api"
import { guardOfficeAttendance } from "./attendance-session-guard"

/**
 * Explanations (owner, 2026-10-16): HR asks someone late or absent without a
 * recorded reason to explain; the employee answers here, or explains a late or
 * absent day of the last month on their own. Editable until HR decides.
 */
export type AttendanceExplanationKind = "LATE" | "ABSENT"
export type AttendanceExplanationStatus = "REQUESTED" | "ANSWERED" | "ACCEPTED" | "REJECTED"
export type AttendanceExplanation = { id: string; date: string; kind: AttendanceExplanationKind; status: AttendanceExplanationStatus
  lateMinutes: number | null; requested: boolean; answer: string | null }
export type AttendanceExplanationCandidate = { date: string; kind: AttendanceExplanationKind; lateMinutes: number | null }
export type AttendanceExplanationAnswer = { date: string; kind: AttendanceExplanationKind; text: string }
export type AttendanceExplanations = { today: string; items: AttendanceExplanation[]; candidates: AttendanceExplanationCandidate[] }

const DATE = /^\d{4}-\d{2}-\d{2}$/
const kindOf = (value: unknown): value is AttendanceExplanationKind => value === "LATE" || value === "ABSENT"
const statusOf = (value: unknown): value is AttendanceExplanationStatus => value === "REQUESTED" || value === "ANSWERED" || value === "ACCEPTED" || value === "REJECTED"
const minutes = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null

/** Keeps only what the screen shows: never names of HR staff or other fields. */
function explanation(value: Record<string, unknown>): AttendanceExplanation {
  if (!value || typeof value.id !== "string" || typeof value.date !== "string" || !DATE.test(value.date) || !kindOf(value.kind) || !statusOf(value.status)) {
    throw new Error("ATTENDANCE_EXPLANATIONS_INVALID")
  }
  return { id: value.id, date: value.date, kind: value.kind, status: value.status, lateMinutes: minutes(value.lateMinutes),
    requested: typeof value.requestedAt === "string", answer: typeof value.answer === "string" ? value.answer : null }
}
function candidate(value: Record<string, unknown>): AttendanceExplanationCandidate {
  if (!value || typeof value.date !== "string" || !DATE.test(value.date) || !kindOf(value.kind)) throw new Error("ATTENDANCE_EXPLANATIONS_INVALID")
  return { date: value.date, kind: value.kind, lateMinutes: minutes(value.lateMinutes) }
}

export async function readAttendanceExplanations(scope: string): Promise<AttendanceExplanations> {
  const guard = () => guardOfficeAttendance(scope)
  guard(); const response = await api.getAttendanceExplanations(guard); guard()
  const data = response?.data
  if (response?.success !== true || typeof data?.today !== "string" || !Array.isArray(data.items) || !Array.isArray(data.candidates)
    || data.items.length > 200 || data.candidates.length > 100) throw new Error("ATTENDANCE_EXPLANATIONS_INVALID")
  return { today: data.today, items: data.items.map(explanation), candidates: data.candidates.map(candidate) }
}

export async function answerAttendanceExplanation(scope: string, input: AttendanceExplanationAnswer): Promise<AttendanceExplanation> {
  const text = input.text.trim()
  if (text.length < 3 || text.length > 1000) throw Object.assign(new Error("ATTENDANCE_EXPLANATION_TEXT"), { code: "MTM_ATTENDANCE_EXPLANATION_INVALID" })
  const guard = () => guardOfficeAttendance(scope)
  guard(); const response = await api.answerAttendanceExplanation({ ...input, text }, guard); guard()
  if (response?.success !== true || !response.data?.item) throw new Error("ATTENDANCE_EXPLANATIONS_INVALID")
  return explanation(response.data.item)
}

/** Requests first (HR is waiting), then the days one may still explain, then the rest. */
export function attendanceExplanationSections(data: AttendanceExplanations) {
  return {
    asked: data.items.filter(item => item.status === "REQUESTED"),
    open: data.candidates,
    written: data.items.filter(item => item.status !== "REQUESTED"),
  }
}
