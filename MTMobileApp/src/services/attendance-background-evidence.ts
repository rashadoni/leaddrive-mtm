import { useAuthStore } from '../store/auth'
import { useWorkdayStore } from '../store/workday'
import { attendanceLocationAvailable, attendanceLocationScope, guardAttendanceLocation, pendingAttendanceConsent, readAttendanceLocation } from './attendance-location'
import { attendancePrivacyBlocked, attendancePrivacyEpoch } from './outbox'
import type { QueuedPoint } from './location-outbox'

/** Removes the new evidence only; existing field coordinates keep their policy. */
export function withoutAttendanceBackgroundEvidence(point: QueuedPoint): QueuedPoint {
  const { isMock: _mock, attendanceConsentId: _consent, ...ordinary } = point
  return ordinary
}

/** New captures may attach a native boolean. Retries can only retain their
 * original exact consent receipt, never borrow a newer acceptance. */
export async function prepareAttendanceBackgroundEvidence(point: QueuedPoint, nativeMock?: boolean) {
  const ordinary = withoutAttendanceBackgroundEvidence(point)
  const unavailable = { point: ordinary, guard: () => {} }
  if (useAuthStore.getState().agent?.role !== 'AGENT' || !attendanceLocationAvailable()) return unavailable
  const scope = attendanceLocationScope(), epoch = attendancePrivacyEpoch(scope)
  const guard = () => {
    guardAttendanceLocation(scope)
    if (attendancePrivacyBlocked(scope) || epoch !== attendancePrivacyEpoch(scope)) throw new Error('ATTENDANCE_CONSENT_CHANGED')
  }
  try {
    guard()
    if (useWorkdayStore.getState().activeWorkday?.paused || await pendingAttendanceConsent(scope)) return unavailable
    const own = await readAttendanceLocation(scope); guard()
    if (!own.maySendLocation || !own.consent || Date.parse(point.recordedAt) < Date.parse(own.consent.createdAt)
      || !Number.isFinite(Date.parse(point.recordedAt))) return unavailable
    const isMock = typeof nativeMock === 'boolean' ? nativeMock : point.isMock
    if (typeof isMock !== 'boolean' || (nativeMock === undefined && point.attendanceConsentId !== own.consent.id)) return unavailable
    return { point: { ...ordinary, isMock, attendanceConsentId: own.consent.id }, guard }
  } catch { return unavailable }
}
