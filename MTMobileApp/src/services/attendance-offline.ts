import AsyncStorage from '@react-native-async-storage/async-storage'
import { api } from './api'
import { getFieldDeviceId } from './field-device-id'
import { getOfflineScope } from './offline-scope'
import { hasOfficeAttendanceAccess } from './attendance-access'
import { toBootstrap, type BootstrapData } from './bootstrap'
import { parseAttendanceInstallation, type AttendanceInstallation } from './attendance-installation-contract'
import { parseOwnAttendanceLocation, type OwnAttendanceLocation } from './attendance-location-contract'
import { ATTENDANCE_OFFLINE_WINDOW_MS, offlineCaptureValid, type AttendanceOffline } from './attendance-offline-policy'

// Product policy for provisional local capture, NOT a server-signed license.
// A fresh online bootstrap is mandatory before any queued event is sent.
const KEY = '@mtm_attendance_offline_v1'
type Saved = AttendanceOffline & {
  version: 1; scope: string; server: string; session: string; installationId: string; data: BootstrapData
}
let writes: Promise<unknown> = Promise.resolve()
let epoch = 0
function serialized<T>(run: () => Promise<T>): Promise<T> {
  const next = writes.then(run); writes = next.catch(() => {}); return next
}
export function forgetAttendanceOffline(): Promise<void> {
  epoch += 1
  return serialized(() => AsyncStorage.removeItem(KEY))
}
function principal(data: BootstrapData) {
  return data.principal && data.tenant ? { ...data.principal, organizationId: data.tenant.id } : null
}
export async function rememberAttendanceOnline(data: BootstrapData, scope: string | null, current: () => boolean) {
  const ticket = epoch
  if (!scope || !hasOfficeAttendanceAccess(data, principal(data))) return forgetAttendanceOffline()
  const guard = () => { if (!current() || scope !== getOfflineScope() || ticket !== epoch) throw new Error('ATTENDANCE_SCOPE_CHANGED') }
  try {
    guard()
    const binding = await api.getAttendanceOfflineContext(true), installationId = await getFieldDeviceId()
    guard(); if (!binding) return
    let installation: AttendanceInstallation | null = null
    if (data.policies.agentPermissions?.attendanceInstallation === true) {
      const response = await api.getAttendanceInstallation(guard); guard()
      if (response?.success !== true) throw new Error('ATTENDANCE_INSTALLATION_INVALID')
      installation = parseAttendanceInstallation(response.data)
      if (installation.required && installation.state !== 'APPROVED') { await forgetAttendanceOffline(); return }
    }
    let location: OwnAttendanceLocation | null = null
    if (data.policies.agentPermissions?.attendanceLocation === true) {
      try {
        const response = await api.getAttendanceLocationConsent(guard); guard()
        if (response?.success === true) location = parseOwnAttendanceLocation(response.data)
      } catch { guard() /* No cached consent means no offline GPS. */ }
    }
    guard()
    const verifiedAt = Date.now()
    const saved: Saved = { version: 1, scope, ...binding, installationId, data,
      verifiedAt, lastSeenAt: verifiedAt, validUntil: verifiedAt + ATTENDANCE_OFFLINE_WINDOW_MS, installation, location }
    await serialized(async () => { guard(); await AsyncStorage.setItem(KEY, JSON.stringify(saved)); guard() })
  } catch {
    // A failed preparation cannot refresh or leave an older approval usable.
    if (current() && ticket === epoch) await forgetAttendanceOffline().catch(() => {})
  }
}
export async function restoreAttendanceOffline(scope: string | null, current: () => boolean): Promise<BootstrapData | null> {
  const ticket = epoch
  try {
    if (!scope) return null
    const binding = await api.getAttendanceOfflineContext(), installationId = await getFieldDeviceId()
    return await serialized(async () => {
      if (!binding || !current() || ticket !== epoch || scope !== getOfflineScope()) return null
      const raw = await AsyncStorage.getItem(KEY)
      if (!raw) return null
      const saved: Saved = JSON.parse(raw)
      if (saved.version !== 1 || saved.scope !== scope || saved.server !== binding.server || saved.session !== binding.session
        || saved.installationId !== installationId || !offlineCaptureValid(saved)) return null
      const data = toBootstrap(saved.data)
      if (!hasOfficeAttendanceAccess(data, principal(data)) || `${data.tenant!.id}:${data.principal!.id}` !== scope) return null
      const installation = saved.installation ? parseAttendanceInstallation(saved.installation) : null
      if (data.policies.agentPermissions?.attendanceInstallation === true && !installation) return null
      if (installation?.required && installation.state !== 'APPROVED') return null
      const location = saved.location ? parseOwnAttendanceLocation(saved.location) : null
      const lastSeenAt = Math.max(Date.now(), saved.lastSeenAt)
      if (!current() || ticket !== epoch || scope !== getOfflineScope()) return null
      await AsyncStorage.setItem(KEY, JSON.stringify({ ...saved, lastSeenAt }))
      if (!current() || ticket !== epoch || scope !== getOfflineScope()) return null
      // No field/team capability, stream, route cache or server-return action
      // can be authorized by the provisional own-attendance snapshot.
      return { ...data, capabilities: [], routeFieldAccess: 'offline',
        manifest: { ...data.manifest!, streams: [], syncV2: { routes: false, routesEpoch: null },
          modules: { ...data.manifest!.modules, routeField: { enabled: false, scopeVersion: null } } },
        policies: { ...data.policies, workdayReturn: false },
        attendanceOffline: { verifiedAt: saved.verifiedAt, validUntil: saved.validUntil, lastSeenAt, installation, location } }
    })
  } catch { return null }
}
