import { useAuthStore } from "../store/auth"
import { useBootstrapStore } from "../store/bootstrap"
import { useWorkdayStore } from "../store/workday"
import { offlineScopeKey, getOfflineScope } from "./offline-scope"
import { guardOfficeAttendance, officeAttendanceScope } from "./attendance-session-guard"
import { runMobileSync } from "./sync-engine"

/** Both shells share the durable workday; only the office lane is selected here. */
export async function refreshAttendanceSession(continueSession?: () => void): Promise<boolean> {
  continueSession?.()
  const auth = useAuthStore.getState()
  const scope = offlineScopeKey(auth.agent?.organizationId, auth.agent?.id)
  if (!auth.isLoggedIn || !scope || getOfflineScope() !== scope) return false
  const current = () => getOfflineScope() === scope && useAuthStore.getState().agent?.role === auth.agent?.role
  await useWorkdayStore.getState().hydrate()
  continueSession?.()
  if (!current()) return false
  await useBootstrapStore.getState().fetchBootstrap()
  continueSession?.()
  if (!current()) return false
  try { guardOfficeAttendance(scope) } catch { return false }
  const reconcile = () => continueSession
    ? useWorkdayStore.getState().reconcileFromServer(scope, useBootstrapStore.getState().data?.workday, continueSession)
    : useWorkdayStore.getState().reconcileFromServer(scope, useBootstrapStore.getState().data?.workday)
  await reconcile()
  continueSession?.()
  guardOfficeAttendance(scope)
  if (useBootstrapStore.getState().data?.attendanceOffline) return true
  await runMobileSync()
  continueSession?.()
  if (!current()) return false
  await useBootstrapStore.getState().fetchBootstrap()
  continueSession?.()
  if (!current()) return false
  try { guardOfficeAttendance(scope) } catch { return false }
  await reconcile()
  return true
}
export async function changeAttendanceWorkday(action: "start" | "end" | "pause" | "resume", qrToken?: string | null) {
  const scope = officeAttendanceScope()
  if ((action === "start" || action === "end") && qrToken !== undefined) await useWorkdayStore.getState()[action](scope, () => guardOfficeAttendance(scope), qrToken)
  else await useWorkdayStore.getState()[action](scope, () => guardOfficeAttendance(scope))
  guardOfficeAttendance(scope)
}
