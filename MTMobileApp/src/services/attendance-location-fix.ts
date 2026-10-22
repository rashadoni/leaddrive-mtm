import Geolocation from '@react-native-community/geolocation'
import { PermissionsAndroid, Platform } from 'react-native'
import type { AttendanceMark } from './attendance-location-contract'

/** Bounded foreground acquisition after application consent. Android tries
 * fresh network positioning when satellites cannot answer indoors. No watch,
 * background permission or cached-position fallback. Missing provenance is
 * unavailable rather than a fabricated non-mock fix.
 *
 * `mayAsk: false` for a field agent: their location is recorded with the app
 * closed, so Android's sheet may open only through the app's disclosure
 * coordinator (field-location-permission.ts).
 * Without a grant their mark goes without a place; the workday's own GPS
 * start asks, after the disclosure. */
export async function readAttendanceLocationFix(guard: () => void, options: { mayAsk?: boolean } = {}): Promise<AttendanceMark['location']> {
  let expired = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let finishTimeout!: (value: null) => void
  const timeout = new Promise<null>(resolve => { finishTimeout = resolve })
  const deadline = (milliseconds: number) => {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => { expired = true; finishTimeout(null) }, milliseconds)
  }
  const current = () => { guard(); if (expired) throw new Error('ATTENDANCE_LOCATION_TIMEOUT') }
  const readFix = (enableHighAccuracy: boolean, timeout: number): Promise<AttendanceMark['location']> => {
    current()
    return new Promise((resolve, reject) => {
      Geolocation.getCurrentPosition(position => {
        try { current() } catch { resolve(null); return }
        const { latitude, longitude, accuracy } = position.coords
        const mocked = (position as unknown as { mocked?: unknown }).mocked
        if (![latitude, longitude, accuracy, position.timestamp].every(Number.isFinite) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180
          || accuracy < 0 || accuracy > 100000 || typeof mocked !== 'boolean') { resolve(null); return }
        resolve({ latitude, longitude, accuracy, capturedAt: new Date(position.timestamp).toISOString(), provider: 'UNKNOWN', isMock: mocked })
      }, reject, { enableHighAccuracy, timeout, maximumAge: 0 })
    })
  }
  const read = async (): Promise<AttendanceMark['location']> => {
    current()
    if (Platform.OS === 'android') {
      const permission = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      const allowed = await PermissionsAndroid.check(permission); current()
      if (!allowed) {
        if (options.mayAsk === false) return null
        // Reading/answering Android's sheet is not time spent acquiring GPS.
        // Keep a separate bound so an abandoned sheet cannot hold a mark forever.
        deadline(60_000)
        const answer = await PermissionsAndroid.request(permission); current()
        if (answer !== PermissionsAndroid.RESULTS.GRANTED) return null
      }
      Geolocation.setRNConfiguration({ skipPermissionRequests: true, locationProvider: 'android' })
    }
    current()
    deadline(Platform.OS === 'android' ? 12_000 : 8_000)
    try {
      return await readFix(true, 7_000)
    } catch (error) {
      // Keep the Android provider: the library's Play Services path has a
      // documented native listener crash in this app. A lower-accuracy request
      // selects Android's network provider without accepting a cached fix.
      if (Platform.OS !== 'android' || !error || typeof error !== 'object'
        || !('code' in error) || (error.code !== 2 && error.code !== 3)) return null
      current()
      const allowed = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION)
      current()
      if (!allowed) return null
      return await readFix(false, 4_000)
    }
  }
  try {
    deadline(8_000)
    return await Promise.race([read().catch(() => null), timeout])
  } finally { expired = true; if (timer !== undefined) clearTimeout(timer) }
}
