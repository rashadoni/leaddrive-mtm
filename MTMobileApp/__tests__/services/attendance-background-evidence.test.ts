import AsyncStorage from '@react-native-async-storage/async-storage'
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('../../src/services/api', () => ({ api: { getAttendanceLocationConsent: jest.fn() } }))
jest.mock('../../src/store/auth', () => ({ useAuthStore: { getState: jest.fn() } }))
jest.mock('../../src/store/bootstrap', () => ({ useBootstrapStore: { getState: jest.fn() } }))
jest.mock('../../src/store/workday', () => ({ useWorkdayStore: { getState: jest.fn() } }))
import { api } from '../../src/services/api'
import { useAuthStore } from '../../src/store/auth'
import { useBootstrapStore } from '../../src/store/bootstrap'
import { useWorkdayStore } from '../../src/store/workday'
import { officeAgent, officeBootstrap } from '../../test-support/office-attendance'
import { setOfflineScope } from '../../src/services/offline-scope'
import { prepareAttendanceBackgroundEvidence } from '../../src/services/attendance-background-evidence'
import { attendancePrivacyEpoch, queueAttendanceConsent, releaseAttendancePrivacyBlock } from '../../src/services/outbox'
import { queuePoint, readQueue, flushQueue, redactBackgroundAttendanceEvidence } from '../../src/services/location-outbox'
const agent = { ...officeAgent, role: 'AGENT' }, scope = `${agent.organizationId}:${agent.id}`
const point = { latitude: 40.4, longitude: 49.8, recordedAt: '2026-10-13T08:00:00.000Z', clientLocationId: 'gps-fictional', workdayId: 'wd-fixture' }
const own = { policy: { id: 'policy-fixture', version: 1, enabled: true, legalReviewConfirmed: true, texts: { ru: 'Fictional RU acceptance text', az: 'Fictional AZ acceptance text', en: 'Fictional EN acceptance text' }, createdAt: '2026-10-12T00:00:00Z' }, consent: { id: 'exact-receipt', policyRevisionId: 'policy-fixture', accepted: true, createdAt: '2026-10-13T07:00:00Z' }, maySendLocation: true }
let data = officeBootstrap('AGENT')
beforeEach(async () => {
  jest.clearAllMocks(); await AsyncStorage.clear(); setOfflineScope(agent.organizationId, agent.id)
  releaseAttendancePrivacyBlock(scope, attendancePrivacyEpoch(scope)); data = officeBootstrap('AGENT')
  data.policies.attendanceMarkVersion = 1; data.policies.agentPermissions!.attendanceLocation = true
  ;(useAuthStore.getState as jest.Mock).mockReturnValue({ isLoggedIn: true, agent })
  ;(useBootstrapStore.getState as jest.Mock).mockImplementation(() => ({ data, routeFieldAccess: 'enabled' }))
  ;(useWorkdayStore.getState as jest.Mock).mockReturnValue({ activeWorkday: { key: scope, workdayId: 'wd-fixture', paused: false } })
  ;(api.getAttendanceLocationConsent as jest.Mock).mockResolvedValue({ success: true, data: own })
})
it.each([true, false])('keeps native mock value %s with the exact accepted receipt', async value => {
  const result = await prepareAttendanceBackgroundEvidence(point, value)
  expect(result.point).toEqual({ ...point, isMock: value, attendanceConsentId: 'exact-receipt' })
  expect(() => result.guard()).not.toThrow()
})
it('never invents false when an older native provider omits the value', async () => {
  expect((await prepareAttendanceBackgroundEvidence(point)).point).toEqual(point)
})
it.each(['feature', 'consent', 'old-point', 'pause', 'offline'])('omits evidence for %s while retaining ordinary field coordinates', async reason => {
  let source = point
  if (reason === 'feature') data.policies.agentPermissions!.attendanceLocation = false
  if (reason === 'consent') (api.getAttendanceLocationConsent as jest.Mock).mockResolvedValue({ success: true, data: { policy: null, consent: null, maySendLocation: false } })
  if (reason === 'old-point') source = { ...point, recordedAt: '2026-10-13T06:00:00.000Z' }
  if (reason === 'pause') (useWorkdayStore.getState as jest.Mock).mockReturnValue({ activeWorkday: { paused: true } })
  if (reason === 'offline') (api.getAttendanceLocationConsent as jest.Mock).mockRejectedValue(new Error('offline'))
  expect((await prepareAttendanceBackgroundEvidence(source, true)).point).toEqual(source)
})
it('does not assign a queued flag to a newer acceptance and stops a withdrawal during HTTP setup', async () => {
  expect((await prepareAttendanceBackgroundEvidence({ ...point, isMock: true, attendanceConsentId: 'older-receipt' })).point).toEqual(point)
  const prepared = await prepareAttendanceBackgroundEvidence(point, true)
  await queueAttendanceConsent(scope, { requestId: 'fictional-withdrawal', policyRevisionId: 'policy-fixture', expectedConsentId: 'exact-receipt', accepted: false })
  expect(() => prepared.guard()).toThrow('ATTENDANCE_CONSENT_CHANGED')
  expect((await prepareAttendanceBackgroundEvidence(prepared.point)).point).toEqual(point)
})
it('preserves a concurrent capture and persisted redaction when a flush finishes', async () => {
  await queuePoint({ ...point, isMock: true, attendanceConsentId: 'exact-receipt' })
  const later = { ...point, clientLocationId: 'gps-later', isMock: false, attendanceConsentId: 'exact-receipt' }
  await flushQueue(async () => { await queuePoint(later); await redactBackgroundAttendanceEvidence(); throw new Error('offline') })
  expect(await readQueue()).toEqual([point, { ...point, clientLocationId: 'gps-later' }])
})
it('reports failed redaction persistence without claiming it was saved', async () => {
  await queuePoint({ ...point, isMock: true, attendanceConsentId: 'exact-receipt' })
  ;(AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk'))
  await expect(redactBackgroundAttendanceEvidence()).rejects.toThrow('disk')
  expect((await readQueue())[0].attendanceConsentId).toBe('exact-receipt')
})
