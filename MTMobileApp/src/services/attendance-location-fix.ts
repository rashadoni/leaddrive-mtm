import Geolocation from '@react-native-community/geolocation'
import { PermissionsAndroid, Platform } from 'react-native'
import type { AttendanceMark } from './attendance-location-contract'

/** One bounded foreground reading after application consent. No watch,
 * background permission or cached-position fallback. Missing provenance is
 * unavailable rather than a fabricated non-mock fix. */
export async function readAttendanceLocationFix(guard: () => void): Promise<AttendanceMark['location']> {
  let expired = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const current = () => { guard(); if (expired) throw new Error('ATTENDANCE_LOCATION_TIMEOUT') }
  const read = async (): Promise<AttendanceMark['location']> => {
    current()
    if (Platform.OS === 'android') {
      const permission = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      const allowed = await PermissionsAndroid.check(permission); current()
      if (!allowed) {
        const answer = await PermissionsAndroid.request(permission); current()
        if (answer !== PermissionsAndroid.RESULTS.GRANTED) return null
      }
      Geolocation.setRNConfiguration({ skipPermissionRequests: true, locationProvider: 'android' })
    }
    current()
    return new Promise(resolve => {
      Geolocation.getCurrentPosition(position => {
        try { current() } catch { resolve(null); return }
        const { latitude, longitude, accuracy } = position.coords
        const mocked = (position as unknown as { mocked?: unknown }).mocked
        if (![latitude, longitude, accuracy, position.timestamp].every(Number.isFinite) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180
          || accuracy < 0 || accuracy > 100000 || typeof mocked !== 'boolean') { resolve(null); return }
        resolve({ latitude, longitude, accuracy, capturedAt: new Date(position.timestamp).toISOString(), provider: 'UNKNOWN', isMock: mocked })
      }, () => resolve(null), { enableHighAccuracy: true, timeout: 7_000, maximumAge: 0 })
    })
  }
  try {
    return await Promise.race([read().catch(() => null), new Promise<null>(resolve => { timer = setTimeout(() => { expired = true; resolve(null) }, 8_000) })])
  } finally { expired = true; if (timer) clearTimeout(timer) }
}
