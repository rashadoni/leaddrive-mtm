import { useSyncStatusStore } from "../store/sync-status"
import { useAuthStore } from "../store/auth"
import { useBootstrapStore } from "../store/bootstrap"
import { getOfflineScope, offlineScopeKey } from "./offline-scope"
import { hasOfficeAttendanceAccess } from "./attendance-access"

export function officeAttendanceScope(): string {
  const auth = useAuthStore.getState(), data = useBootstrapStore.getState().data
  const scope = offlineScopeKey(auth.agent?.organizationId, auth.agent?.id)
  if (!auth.isLoggedIn || !scope || getOfflineScope() !== scope || !hasOfficeAttendanceAccess(data, auth.agent)
    || (useSyncStatusStore.getState().online === false && !data?.attendanceOffline)) {
    throw Object.assign(new Error("ATTENDANCE_ACCESS_UNAVAILABLE"), { status: 403 })
  }
  return scope
}
export function guardOfficeAttendance(scope: string) {
  if (officeAttendanceScope() !== scope) throw new Error("ATTENDANCE_SCOPE_CHANGED")
}
