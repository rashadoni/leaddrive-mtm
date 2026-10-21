import { PermissionsAndroid, Platform } from 'react-native'
import Geolocation from '@react-native-community/geolocation'
jest.mock('@react-native-community/geolocation', () => ({ getCurrentPosition: jest.fn(), setRNConfiguration: jest.fn() }))
import { readAttendanceLocationFix } from '../../src/services/attendance-location-fix'
const point = { coords: { latitude: 40, longitude: 49, accuracy: 7 }, timestamp: 1791878400000, mocked: false }
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks(); Object.defineProperty(Platform,'OS',{value:'android', configurable:true})
  jest.spyOn(PermissionsAndroid,'check').mockResolvedValue(true); jest.spyOn(PermissionsAndroid,'request').mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED)
  ;(Geolocation.getCurrentPosition as jest.Mock).mockImplementation(done => done(point))
})
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks() })
it('requests one current foreground fix with honest mock metadata and no cached fallback', async () => {
  expect(await readAttendanceLocationFix(() => {})).toEqual({latitude:40,longitude:49,accuracy:7,capturedAt:new Date(point.timestamp).toISOString(),provider:'UNKNOWN',isMock:false})
  expect(Geolocation.getCurrentPosition).toHaveBeenCalledTimes(1)
  expect((Geolocation.getCurrentPosition as jest.Mock).mock.calls[0][2]).toEqual({enableHighAccuracy:true,timeout:7000,maximumAge:0})
  expect(PermissionsAndroid.request).not.toHaveBeenCalled()
})
it('does not query GPS after denied phone permission', async () => {
  ;(PermissionsAndroid.check as jest.Mock).mockResolvedValue(false); (PermissionsAndroid.request as jest.Mock).mockResolvedValue(PermissionsAndroid.RESULTS.DENIED)
  expect(await readAttendanceLocationFix(() => {})).toBeNull(); expect(Geolocation.getCurrentPosition).not.toHaveBeenCalled()
})
it('asks a field agent nothing: without a grant no sheet, no GPS and no place', async () => {
  ;(PermissionsAndroid.check as jest.Mock).mockResolvedValue(false)
  expect(await readAttendanceLocationFix(() => {}, { mayAsk: false })).toBeNull()
  expect(PermissionsAndroid.request).not.toHaveBeenCalled(); expect(Geolocation.getCurrentPosition).not.toHaveBeenCalled()
})
it('reads a field agent\'s place when the grant is already there', async () => {
  expect(await readAttendanceLocationFix(() => {}, { mayAsk: false })).toMatchObject({ latitude: 40, longitude: 49 })
  expect(PermissionsAndroid.request).not.toHaveBeenCalled()
})
it.each([undefined, null])('never invents isMock=false when native metadata is %s', async mocked => {
  ;(Geolocation.getCurrentPosition as jest.Mock).mockImplementation(done => done({...point,mocked}))
  expect(await readAttendanceLocationFix(() => {})).toBeNull()
})
it('does not continue capturing after a revoked guard', async () => {
  let allowed = true
  ;(PermissionsAndroid.check as jest.Mock).mockImplementation(async () => { allowed = false; return true })
  expect(await readAttendanceLocationFix(() => { if (!allowed) throw new Error('revoked') })).toBeNull()
  expect(Geolocation.getCurrentPosition).not.toHaveBeenCalled()
})
it('bounds a stalled permission dialog and never captures after its late answer', async () => {
  let answer!: (value: boolean) => void
  ;(PermissionsAndroid.check as jest.Mock).mockImplementation(() => new Promise(resolve => {answer=resolve}))
  const pending = readAttendanceLocationFix(() => {})
  await jest.advanceTimersByTimeAsync(8001); expect(await pending).toBeNull()
  answer(true); await Promise.resolve(); await Promise.resolve(); expect(Geolocation.getCurrentPosition).not.toHaveBeenCalled()
})
it('bounds a silent native bridge and discards a late fix', async () => {
  let callback!: (value: typeof point) => void
  ;(Geolocation.getCurrentPosition as jest.Mock).mockImplementation(done => {callback=done})
  const pending = readAttendanceLocationFix(() => {}); await jest.advanceTimersByTimeAsync(8001)
  expect(await pending).toBeNull(); callback(point)
})
it('gives the employee time to answer the OS sheet before starting the GPS budget', async () => {
  let grant!: (value: string) => void
  let fix!: (value: typeof point) => void
  ;(PermissionsAndroid.check as jest.Mock).mockResolvedValue(false)
  ;(PermissionsAndroid.request as jest.Mock).mockImplementation(() => new Promise(resolve => { grant = resolve }))
  ;(Geolocation.getCurrentPosition as jest.Mock).mockImplementation(done => { fix = done })
  const pending = readAttendanceLocationFix(() => {})
  let settled = false; void pending.then(() => { settled = true })
  await jest.advanceTimersByTimeAsync(12000)
  expect(settled).toBe(false)
  expect(Geolocation.getCurrentPosition).not.toHaveBeenCalled()
  grant(PermissionsAndroid.RESULTS.GRANTED)
  await jest.advanceTimersByTimeAsync(6000)
  expect(settled).toBe(false)
  fix(point)
  expect(await pending).toMatchObject({ latitude: 40, longitude: 49, isMock: false })
})
it('bounds an unanswered OS sheet separately and ignores a late permission grant', async () => {
  let grant!: (value: string) => void
  ;(PermissionsAndroid.check as jest.Mock).mockResolvedValue(false)
  ;(PermissionsAndroid.request as jest.Mock).mockImplementation(() => new Promise(resolve => { grant = resolve }))
  const pending = readAttendanceLocationFix(() => {})
  await jest.advanceTimersByTimeAsync(60001)
  expect(await pending).toBeNull()
  grant(PermissionsAndroid.RESULTS.GRANTED)
  await jest.advanceTimersByTimeAsync(0)
  expect(Geolocation.getCurrentPosition).not.toHaveBeenCalled()
})
it('does not collect after consent or account access changes while the OS sheet is open', async () => {
  let allowed = true, grant!: (value: string) => void
  ;(PermissionsAndroid.check as jest.Mock).mockResolvedValue(false)
  ;(PermissionsAndroid.request as jest.Mock).mockImplementation(() => new Promise(resolve => { grant = resolve }))
  const pending = readAttendanceLocationFix(() => { if (!allowed) throw new Error('revoked') })
  await jest.advanceTimersByTimeAsync(1000)
  allowed = false; grant(PermissionsAndroid.RESULTS.GRANTED)
  expect(await pending).toBeNull()
  expect(Geolocation.getCurrentPosition).not.toHaveBeenCalled()
})
