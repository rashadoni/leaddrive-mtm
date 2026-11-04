import { api } from "./api"
import { guardOfficeAttendance } from "./attendance-session-guard"

import { validAttendanceDeskToken } from "./attendance-desk-contract"

export { validAttendanceDeskToken }
export type AttendanceDesk = { id: string; branchName: string; pairedAt: string; lastSeenAt: string | null }

/** The phone confirms the desk it scanned; the desk takes its workplace within two minutes. */
export async function pairAttendanceDesk(scope: string, token: string): Promise<{ branchName: string }> {
  if (!validAttendanceDeskToken(token)) throw Object.assign(new Error("ATTENDANCE_DESK_TOKEN"), { code: "MTM_ATTENDANCE_DESK_TOKEN_INVALID" })
  const guard = () => guardOfficeAttendance(scope)
  guard(); const response = await api.pairAttendanceDesk(token, guard); guard()
  const name = response?.data?.branch?.name
  if (response?.success !== true || typeof name !== "string") throw new Error("ATTENDANCE_DESK_INVALID")
  return { branchName: name }
}
export async function readAttendanceDesks(scope: string): Promise<AttendanceDesk[]> {
  const guard = () => guardOfficeAttendance(scope)
  guard(); const response = await api.getAttendanceDesks(guard); guard()
  const desks = response?.data?.desks
  if (response?.success !== true || !Array.isArray(desks) || desks.length > 10) throw new Error("ATTENDANCE_DESK_INVALID")
  return desks.filter((desk: Record<string, unknown>) => typeof desk?.id === "string" && typeof desk.branchName === "string" && typeof desk.pairedAt === "string")
    .map((desk: Record<string, unknown>) => ({ id: desk.id as string, branchName: desk.branchName as string, pairedAt: desk.pairedAt as string, lastSeenAt: typeof desk.lastSeenAt === "string" ? desk.lastSeenAt : null }))
}
export async function revokeAttendanceDesk(scope: string, id: string) {
  const guard = () => guardOfficeAttendance(scope)
  guard(); const response = await api.revokeAttendanceDesk(id, guard); guard()
  if (response?.success !== true) throw new Error("ATTENDANCE_DESK_INVALID")
}
/** Why the server refused a desk, in words the employee can act on. */
export function attendanceDeskRefusal(error: unknown): "off" | "noBranch" | "tooMany" | "failed" {
  const code = (error as { code?: string })?.code
  return code === "MTM_ATTENDANCE_DESK_OFF" || code === "MTM_ATTENDANCE_DESK_QR_OFF" ? "off" : code === "MTM_ATTENDANCE_DESK_NO_BRANCH" ? "noBranch"
    : code === "MTM_ATTENDANCE_DESK_TOO_MANY" ? "tooMany" : "failed"
}
