import { hasOfficeAttendanceAccess, type AttendancePrincipal } from "../services/attendance-access"
import type { BootstrapData } from "../services/bootstrap"

export const ATTENDANCE_APP = {
  applicationId: "com.leaddrive.attendance",
  displayName: "LeadDrive Time",
  version: "1.0.0",
} as const

/** Reuse the server's existing personnel grant; never promote a field agent. */
export function attendanceTabs(data: BootstrapData | null, agent: AttendancePrincipal): string[] {
  if (!hasOfficeAttendanceAccess(data, agent)) return []
  return ["OwnWorkday", ...(data?.policies.agentPermissions?.attendanceRequests === true ? ["OwnRequests"] : []), "OwnExplanations", "OwnInbox", "OwnProfile"]
}
