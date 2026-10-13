import { api } from "./api"
import { guardOfficeAttendance } from "./attendance-session-guard"
export type AttendanceNotice = { id: string; title: string; body: string | null; isRead: boolean; createdAt: string }
export async function readAttendanceInbox(scope: string): Promise<AttendanceNotice[]> {
  const guard = () => guardOfficeAttendance(scope)
  guard(); const response = await api.getOwnAttendanceNotifications(guard); guard()
  if (response?.success !== true || !Array.isArray(response.data?.items) || response.data.items.length > 100) throw new Error("ATTENDANCE_INBOX_INVALID")
  return response.data.items.map((item: Record<string, unknown>) => {
    if (!item || typeof item.id !== "string" || typeof item.title !== "string" || typeof item.isRead !== "boolean" || typeof item.createdAt !== "string") throw new Error("ATTENDANCE_INBOX_INVALID")
    return { id: item.id, title: item.title, body: typeof item.body === "string" ? item.body : null, isRead: item.isRead, createdAt: item.createdAt }
  })
}
export async function markAttendanceInboxRead(scope: string, id: string) {
  const guard = () => guardOfficeAttendance(scope)
  guard(); const response = await api.markOwnAttendanceNotifications([id], guard); guard()
  if (response?.success !== true) throw new Error("ATTENDANCE_INBOX_INVALID")
}
