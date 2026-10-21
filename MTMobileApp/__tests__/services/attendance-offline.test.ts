jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('../../src/services/api', () => ({ api: {
  getAttendanceOfflineContext: jest.fn(), getAttendanceInstallation: jest.fn(), getAttendanceLocationConsent: jest.fn(), getBootstrap: jest.fn(),
} }))
jest.mock('../../src/services/field-device-id', () => ({ getFieldDeviceId: jest.fn() }))
import AsyncStorage from '@react-native-async-storage/async-storage'
import { api } from '../../src/services/api'
import { getFieldDeviceId } from '../../src/services/field-device-id'
import { rememberAttendanceOnline, restoreAttendanceOffline, forgetAttendanceOffline } from '../../src/services/attendance-offline'
import { ATTENDANCE_OFFLINE_WINDOW_MS } from '../../src/services/attendance-offline-policy'
import { hasOfficeAttendanceAccess } from '../../src/services/attendance-access'
import { setOfflineScope } from '../../src/services/offline-scope'
import { officeAgent, officeBootstrap, officeBootstrapPayload } from '../../test-support/office-attendance'
import { useBootstrapStore } from '../../src/store/bootstrap'
import { useSyncStatusStore } from '../../src/store/sync-status'
const scope = `${officeAgent.organizationId}:${officeAgent.id}`
const current = () => true
beforeEach(async () => {
  jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-21T08:00:00Z')); jest.clearAllMocks()
  await forgetAttendanceOffline(); await AsyncStorage.clear()
  useBootstrapStore.getState().clear(); useSyncStatusStore.setState({ online: true })
  setOfflineScope(officeAgent.organizationId, officeAgent.id)
  ;(api.getAttendanceOfflineContext as jest.Mock).mockResolvedValue({ server: 'fixture.invalid', session: 'login-one' })
  ;(getFieldDeviceId as jest.Mock).mockResolvedValue('rf-fixture-installation-0000001')
})
afterEach(() => jest.useRealTimers())
it('restores only an online-admitted own account, with no field/team grants, and never extends the 24-hour deadline', async () => {
  expect(await restoreAttendanceOffline(scope, current)).toBeNull()
  await rememberAttendanceOnline(officeBootstrap(), scope, current)
  jest.setSystemTime(Date.now() + 3600000)
  const restored = await restoreAttendanceOffline(scope, current)
  expect(hasOfficeAttendanceAccess(restored, officeAgent)).toBe(true)
  expect(restored?.routeFieldAccess).toBe('offline'); expect(restored?.capabilities).toEqual([])
  expect(restored?.manifest?.streams).toEqual([]); expect(restored?.manifest?.modules.routeField.enabled).toBe(false)
  expect(restored?.policies.workdayReturn).toBe(false)
  const expiry = restored!.attendanceOffline!.validUntil
  expect(expiry - restored!.attendanceOffline!.verifiedAt).toBe(ATTENDANCE_OFFLINE_WINDOW_MS)
  jest.setSystemTime(expiry - 1); expect((await restoreAttendanceOffline(scope, current))?.attendanceOffline?.validUntil).toBe(expiry)
  jest.setSystemTime(expiry); expect(await restoreAttendanceOffline(scope, current)).toBeNull()
})
it.each(['server', 'session', 'device', 'account', 'role', 'clock', 'logout', 'corrupt'] as const)('refuses a changed %s without granting offline access', async change => {
  await rememberAttendanceOnline(officeBootstrap(), scope, current)
  if (change === 'server') (api.getAttendanceOfflineContext as jest.Mock).mockResolvedValue({ server: 'other.invalid', session: 'login-one' })
  if (change === 'session') (api.getAttendanceOfflineContext as jest.Mock).mockResolvedValue({ server: 'fixture.invalid', session: 'login-two' })
  if (change === 'device') (getFieldDeviceId as jest.Mock).mockResolvedValue('rf-another-installation-00002')
  if (change === 'account') setOfflineScope('other', 'other')
  if (change === 'clock') jest.setSystemTime(Date.now() - 60000)
  if (change === 'logout') await forgetAttendanceOffline()
  if (change === 'corrupt') await AsyncStorage.setItem('@mtm_attendance_offline_v1', '{')
  const restored = await restoreAttendanceOffline(scope, current)
  if (change === 'role') expect(hasOfficeAttendanceAccess(restored, { ...officeAgent, role: 'AGENT' })).toBe(false)
  else expect(restored).toBeNull()
})
it('does not turn a field bootstrap into an offline field grant', async () => {
  await rememberAttendanceOnline(officeBootstrap('AGENT'), scope, current)
  expect(await restoreAttendanceOffline(scope, current)).toBeNull()
})
it('requires a known installation decision and removes an earlier approval after revocation', async () => {
  const data = officeBootstrap(); data.policies.agentPermissions!.attendanceInstallation = true
  const own = { required: true, installationLabel: 'test', state: 'APPROVED', requestId: '11111111-1111-4111-8111-111111111111', submittedAt: '2026-10-21T07:00:00Z', decision: { action: 'APPROVE', at: '2026-10-21T07:01:00Z', reason: 'fixture only' }, revocation: null, canRequest: false }
  ;(api.getAttendanceInstallation as jest.Mock).mockResolvedValue({ success: true, data: own })
  await rememberAttendanceOnline(data, scope, current)
  expect((await restoreAttendanceOffline(scope, current))?.attendanceOffline?.installation?.state).toBe('APPROVED')
  ;(api.getAttendanceInstallation as jest.Mock).mockResolvedValue({ success: true, data: { ...own, state: 'REVOKED', revocation: { at: '2026-10-21T07:30:00Z', reason: 'fixture only' } } })
  await rememberAttendanceOnline(data, scope, current)
  expect(await restoreAttendanceOffline(scope, current)).toBeNull()
})
it('restores after a transport error, but never after a 403 or a withdrawn manifest', async () => {
  ;(api.getBootstrap as jest.Mock).mockResolvedValueOnce({ success: true, data: officeBootstrapPayload() })
  await useBootstrapStore.getState().fetchBootstrap()
  ;(api.getBootstrap as jest.Mock).mockRejectedValueOnce(new Error('Network request failed'))
  await useBootstrapStore.getState().fetchBootstrap()
  expect(useBootstrapStore.getState().data?.attendanceOffline).toBeDefined()
  ;(api.getBootstrap as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('Forbidden'), { status: 403 }))
  await useBootstrapStore.getState().fetchBootstrap()
  expect(useBootstrapStore.getState().data).toBeNull()
  expect(await restoreAttendanceOffline(scope, current)).toBeNull()
  await rememberAttendanceOnline(officeBootstrap(), scope, current)
  const denied = officeBootstrapPayload(); denied.policies.agentPermissions.attendanceWorkday = false
  ;(api.getBootstrap as jest.Mock).mockResolvedValueOnce({ success: true, data: denied })
  await useBootstrapStore.getState().fetchBootstrap()
  expect(await restoreAttendanceOffline(scope, current)).toBeNull()
})
it('cannot publish a cached admission after the account changes during storage read', async () => {
  await rememberAttendanceOnline(officeBootstrap(), scope, current)
  const binding = api.getAttendanceOfflineContext as jest.Mock
  binding.mockImplementationOnce(async () => { setOfflineScope('other', 'other'); return { server: 'fixture.invalid', session: 'login-one' } })
  expect(await restoreAttendanceOffline(scope, current)).toBeNull()
})
