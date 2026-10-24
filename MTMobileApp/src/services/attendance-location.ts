import { api } from './api'
import { useAuthStore } from '../store/auth'
import { useBootstrapStore } from '../store/bootstrap'
import { getOfflineScope, offlineScopeKey } from './offline-scope'
import { hasOfficeAttendanceAccess } from './attendance-access'
import { hasRouteFieldAccess } from './bootstrap'
import { getFieldDeviceId } from './field-device-id'
import { attendanceUuid } from './attendance-contract'
import { parseOwnAttendanceLocation, parseAttendanceConsent, type OwnAttendanceLocation, type AttendanceConsentInput, type AttendanceMark } from './attendance-location-contract'
import { attendancePrivacyOperations, queueAttendanceConsent, attendancePrivacyEpoch, attendancePrivacyBlocked, releaseAttendancePrivacyBlock, prepareAttendanceMarks, acknowledgeOutboxOperation, markOutboxConflict, type OutboxOperation, type OutboxPushResult } from './outbox'

export function attendanceMarkAvailable(): boolean {
  const auth = useAuthStore.getState(), { data, routeFieldAccess } = useBootstrapStore.getState(), m = data?.manifest
  return auth.isLoggedIn && !!auth.agent && !!m && m.tenant.id === auth.agent.organizationId && data?.tenant?.id === auth.agent.organizationId
    && m.principal.id === auth.agent.id && data?.principal?.id === auth.agent.id && m.principal.role === auth.agent.role && data?.principal?.role === auth.agent.role
    && data.policies.attendanceMarkVersion === 1 && data.policies.agentPermissions?.attendanceWorkday === true
    && ((auth.agent.role === 'AGENT' && m.modules.routeField.enabled === true && hasRouteFieldAccess(routeFieldAccess)) || hasOfficeAttendanceAccess(data, auth.agent))
}
export function attendanceLocationAvailable(): boolean {
  return attendanceMarkAvailable() && useBootstrapStore.getState().data?.policies.agentPermissions?.attendanceLocation === true
}
function guardAccount(scope: string) {
  const auth = useAuthStore.getState()
  if (!auth.isLoggedIn || getOfflineScope() !== scope || offlineScopeKey(auth.agent?.organizationId, auth.agent?.id) !== scope) throw new Error('ATTENDANCE_SCOPE_CHANGED')
}
export function guardAttendanceMark(scope: string) {
  guardAccount(scope)
  if (!attendanceMarkAvailable()) throw Object.assign(new Error('ATTENDANCE_LOCATION_UNAVAILABLE'), { status: 403 })
}
export function attendanceLocationScope(): string {
  const scope = getOfflineScope()
  if (!scope || !attendanceLocationAvailable()) throw Object.assign(new Error('ATTENDANCE_LOCATION_UNAVAILABLE'), { status: 403 })
  guardAccount(scope); return scope
}
export function guardAttendanceLocation(scope: string) {
  if (attendanceLocationScope() !== scope) throw new Error('ATTENDANCE_SCOPE_CHANGED')
}
export async function readAttendanceLocation(scope: string): Promise<OwnAttendanceLocation> {
  const guard = () => guardAttendanceLocation(scope)
  guard()
  const offline = useBootstrapStore.getState().data?.attendanceOffline
  if (offline) {
    if (!offline.location) throw new Error('ATTENDANCE_LOCATION_UNAVAILABLE')
    return offline.location
  }
  guard(); const response = await api.getAttendanceLocationConsent(guard); guard()
  if (response?.success !== true) throw new Error('ATTENDANCE_LOCATION_INVALID')
  return parseOwnAttendanceLocation(response.data)
}
export async function pendingAttendanceConsent(scope: string) {
  guardAccount(scope)
  const items = await attendancePrivacyOperations(scope); guardAccount(scope)
  return items.find(item => item.scopeKey === scope && item.entity === 'attendanceConsents') ?? null
}
export async function beginAttendanceConsent(scope: string, own: OwnAttendanceLocation, accepted: boolean) {
  guardAttendanceLocation(scope)
  const policyRevisionId = accepted ? own.policy?.id : own.consent?.policyRevisionId
  if (!policyRevisionId || (accepted && (!own.policy?.enabled || !own.policy.legalReviewConfirmed))) throw new Error('ATTENDANCE_LOCATION_INVALID')
  const input: AttendanceConsentInput = { requestId: attendanceUuid(), policyRevisionId, expectedConsentId: own.consent?.id ?? null, accepted }
  const item = await queueAttendanceConsent(scope, input)
  // Field coordinates retain their existing contract. Remove only this new,
  // consent-bound evidence from its separate queue; the epoch already blocks
  // transport even if this second storage write fails.
  const { redactBackgroundAttendanceEvidence } = require('./location-outbox') as typeof import('./location-outbox')
  await redactBackgroundAttendanceEvidence()
  guardAccount(scope)
  return item
}
/** Explicit retry and background flush share the exact durable request body. */
export async function sendAttendanceConsent(scope: string, item: OutboxOperation): Promise<void> {
  const guard = () => guardAttendanceLocation(scope)
  guard()
  if (useBootstrapStore.getState().data?.attendanceOffline) throw new Error('ATTENDANCE_ONLINE_REQUIRED')
  if (item.scopeKey !== scope || item.entity !== 'attendanceConsents' || item.status !== 'pending') throw new Error('ATTENDANCE_CONSENT_CHANGED')
  const epoch = attendancePrivacyEpoch(scope)
  try {
    const response = await api.setAttendanceLocationConsent(item.data as AttendanceConsentInput, guard); guard()
    if (response?.success !== true) throw new Error('ATTENDANCE_LOCATION_INVALID')
    const receipt = parseAttendanceConsent(response.data?.consent)
    if (receipt.policyRevisionId !== item.data.policyRevisionId || receipt.accepted !== item.data.accepted) throw new Error('ATTENDANCE_LOCATION_INVALID')
    await acknowledgeOutboxOperation(item.operationId); guard()
    if (item.data.accepted === true) releaseAttendancePrivacyBlock(scope, epoch)
  } catch (error) {
    guard()
    // A definite invalid/stale request can be replaced only after a fresh read.
    // It keeps blocking location in the meantime; unknown replies remain exact retries.
    const status = (error as { status?: number })?.status
    if (status === 400 || status === 409 || status === 413 || status === 422) {
      await markOutboxConflict(item.operationId, { operationId: item.operationId, status: 'conflict', error: 'ATTENDANCE_CONSENT_CHANGED' })
    }
    throw error
  }
}
/** Withdrawal is durable before its first provider request, even offline. */
export async function changeAttendanceConsent(scope: string, own: OwnAttendanceLocation, accepted: boolean) {
  const pending = await beginAttendanceConsent(scope, own, accepted)
  await sendAttendanceConsent(scope, pending)
  return readAttendanceLocation(scope)
}

export async function captureAttendanceMark(scope: string, occurredAt: string, paused: boolean): Promise<AttendanceMark | undefined> {
  // Old servers and nonparticipants retain their old wire. This check precedes
  // any device/permission/GPS access, and never converts field admission.
  if (!attendanceMarkAvailable()) return undefined
  guardAccount(scope)
  let installationId: string
  try { installationId = await getFieldDeviceId() } catch { guardAccount(scope); return undefined }
  guardAccount(scope)
  const empty: AttendanceMark = { version: 1, installationId, locationState: 'NO_CONSENT', consentRevisionId: null, location: null }
  if (paused || !attendanceLocationAvailable()) return empty
  const epoch = attendancePrivacyEpoch(scope)
  let own: OwnAttendanceLocation
  try {
    if (attendancePrivacyBlocked(scope) || await pendingAttendanceConsent(scope)) return empty
    own = await readAttendanceLocation(scope)
  } catch { guardAccount(scope); return empty }
  if (epoch !== attendancePrivacyEpoch(scope) || !own.maySendLocation || !own.consent) return empty
  const receipt = own.consent
  const guard = () => { guardAttendanceLocation(scope); if (epoch !== attendancePrivacyEpoch(scope)) throw new Error('ATTENDANCE_CONSENT_CHANGED') }
  try {
    guard()
    const { readAttendanceLocationFix } = require('./attendance-location-fix') as typeof import('./attendance-location-fix')
    guard()
    // A field agent is asked after the app's disclosure, not inside this mark.
    const fix = await readAttendanceLocationFix(guard, { mayAsk: useAuthStore.getState().agent?.role !== 'AGENT' })
    guard()
    if (!fix || Date.parse(fix.capturedAt) < Date.parse(receipt.createdAt)
      || Date.parse(fix.capturedAt) < Date.parse(occurredAt) || Date.parse(fix.capturedAt) > Date.now() + 1000) {
      return { ...empty, locationState: 'UNAVAILABLE', consentRevisionId: receipt.id }
    }
    return { ...empty, locationState: 'AVAILABLE', consentRevisionId: receipt.id, location: fix }
  } catch {
    guardAccount(scope)
    return epoch === attendancePrivacyEpoch(scope) && attendanceLocationAvailable()
      ? { ...empty, locationState: 'UNAVAILABLE', consentRevisionId: receipt.id } : empty
  }
}

/** Every retry re-reads durable redaction and current consent before transport.
 * The HTTP guard also runs after async device headers, immediately before fetch. */
export async function pushAttendanceLocationOperations(operations: OutboxOperation[], outerGuard?: () => void) {
  const scope = getOfflineScope()
  if (!scope) throw new Error('ATTENDANCE_SCOPE_CHANGED')
  const guard = () => { outerGuard?.(); guardAccount(scope) }
  guard()
  const results: OutboxPushResult[] = []
  for (const item of operations.filter(item => item.entity === 'attendanceConsents')) {
    guard()
    try { await sendAttendanceConsent(scope, item); results.push({ operationId: item.operationId, status: 'ok' }) }
    catch { guard(); results.push({ operationId: item.operationId, status: 'deferred' }) }
  }
  const legacy = operations.filter(item => item.entity !== 'attendanceConsents')
  if (!legacy.length) return { results }
  let consentId: string | null = null
  const epoch = attendancePrivacyEpoch(scope)
  try {
    if (attendanceLocationAvailable() && !attendancePrivacyBlocked(scope) && !(await pendingAttendanceConsent(scope))) {
      const own = await readAttendanceLocation(scope)
      if (own.maySendLocation) consentId = own.consent!.id
    }
  } catch { guard() }
  guard()
  if (epoch !== attendancePrivacyEpoch(scope)) throw new Error('ATTENDANCE_CONSENT_CHANGED')
  const fresh = await prepareAttendanceMarks(scope, legacy.map(item => item.operationId), consentId)
  guard()
  const sendEpoch = epoch
  const sendGuard = () => { guard(); if (sendEpoch !== attendancePrivacyEpoch(scope)) throw new Error('ATTENDANCE_CONSENT_CHANGED') }
  const response = await api.syncPush(fresh, sendGuard); sendGuard()
  return { results: [...results, ...(response?.results ?? [])] }
}
