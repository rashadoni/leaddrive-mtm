import type { AttendanceInstallation } from './attendance-installation-contract'
import type { OwnAttendanceLocation } from './attendance-location-contract'

export const ATTENDANCE_OFFLINE_WINDOW_MS = 24 * 60 * 60 * 1000
export type AttendanceOffline = {
  verifiedAt: number
  validUntil: number
  lastSeenAt: number
  installation: AttendanceInstallation | null
  location: OwnAttendanceLocation | null
}
export function offlineCaptureValid(offline: AttendanceOffline, now = Date.now()) {
  return Number.isFinite(offline.verifiedAt) && offline.validUntil === offline.verifiedAt + ATTENDANCE_OFFLINE_WINDOW_MS
    && Number.isFinite(offline.lastSeenAt) && offline.lastSeenAt >= offline.verifiedAt
    && now >= offline.lastSeenAt - 1000 && now < offline.validUntil
}
