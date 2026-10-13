import { useAuthStore } from "../store/auth"
import { useBootstrapStore } from "../store/bootstrap"
import { useWorkdayStore } from "../store/workday"
import { offlineScopeKey, getOfflineScope } from "./offline-scope"
import { guardOfficeAttendance, officeAttendanceScope } from "./attendance-session-guard"
import { runMobileSync } from "./sync-engine"

/** Both shells share the durable workday; only the office lane is selected here. */
export async function refreshAttendanceSession(): Promise<boolean> {
  const auth = useAuthStore.getState()
  const scope = offlineScopeKey(auth.agent?.organizationId, auth.agent?.id)
  if (!auth.isLoggedIn || !scope || getOfflineScope() !== scope) return false
  const current = () => getOfflineScope() === scope && useAuthStore.getState().agent?.role === auth.agent?.role
  await useWorkdayStore.getState().hydrate()
  if (!current()) return false
  await useBootstrapStore.getState().fetchBootstrap()
  if (!current()) return false
  try { guardOfficeAttendance(scope) } catch { return false }
  const reconcile = () => useWorkdayStore.getState().reconcileFromServer(scope, useBootstrapStore.getState().data?.workday)
  await reconcile()
  guardOfficeAttendance(scope)
  await runMobileSync()
  if (!current()) return false
  await useBootstrapStore.getState().fetchBootstrap()
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
