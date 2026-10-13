import AsyncStorage from '@react-native-async-storage/async-storage'
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('../../src/services/api', () => ({ api: { getAttendanceInstallation: jest.fn(), getAttendanceLocationConsent: jest.fn(), setAttendanceLocationConsent: jest.fn(), syncPush: jest.fn() } }))
jest.mock('../../src/store/auth', () => ({ useAuthStore: { getState: jest.fn() } }))
jest.mock('../../src/store/bootstrap', () => ({ useBootstrapStore: { getState: jest.fn() } }))
jest.mock('../../src/services/attendance-location-fix', () => ({ readAttendanceLocationFix: jest.fn() }))
import { api } from '../../src/services/api'
import { useAuthStore } from '../../src/store/auth'
import { useBootstrapStore } from '../../src/store/bootstrap'
import { officeAgent, officeBootstrap } from '../../test-support/office-attendance'
import { setOfflineScope } from '../../src/services/offline-scope'
import { allOutboxOperations, enqueueOutboxOperation, flushOutbox, queueAttendanceConsent, releaseAttendancePrivacyBlock, attendancePrivacyEpoch, markOutboxConflict } from '../../src/services/outbox'
import { captureAttendanceMark, beginAttendanceConsent, changeAttendanceConsent, sendAttendanceConsent, pendingAttendanceConsent, pushAttendanceLocationOperations, attendanceLocationAvailable, readAttendanceLocation } from '../../src/services/attendance-location'
import { parseOwnAttendanceLocation, type OwnAttendanceLocation } from '../../src/services/attendance-location-contract'
import { readAttendanceLocationFix } from '../../src/services/attendance-location-fix'
import { useWorkdayStore } from '../../src/store/workday'
import { queuePoint, readQueue } from '../../src/services/location-outbox'
const scope = `${officeAgent.organizationId}:${officeAgent.id}`
const timestamp = '2026-10-13T08:00:00.000Z'
const fix = { latitude: 40.4, longitude: 49.8, accuracy: 12, capturedAt: timestamp, isMock: false, provider: 'UNKNOWN' as const }
const accepted: OwnAttendanceLocation = { policy: { id: 'policy-one', version: 1, enabled: true, legalReviewConfirmed: true, texts: {ru: 'Fictional fixture only — RU approved text', az: 'Fictional fixture only — AZ approved text', en: 'Fictional fixture only — EN approved text'}, createdAt: '2026-10-12T00:00:00Z' }, consent: { id: 'exact-receipt', policyRevisionId: 'policy-one', accepted: true, createdAt: '2026-10-13T07:00:00Z' }, maySendLocation: true }
let data = officeBootstrap()
beforeEach(async () => {
  jest.clearAllMocks(); jest.useFakeTimers().setSystemTime(new Date(timestamp)); await AsyncStorage.clear()
  setOfflineScope(officeAgent.organizationId, officeAgent.id); releaseAttendancePrivacyBlock(scope, attendancePrivacyEpoch(scope)); data = officeBootstrap(); data.policies.attendanceMarkVersion = 1; data.policies.agentPermissions!.attendanceLocation = true
  ;(useAuthStore.getState as jest.Mock).mockReturnValue({ isLoggedIn: true, agent: officeAgent })
  ;(useBootstrapStore.getState as jest.Mock).mockImplementation(() => ({ data, routeFieldAccess: 'unavailable' }))
  ;(api.getAttendanceLocationConsent as jest.Mock).mockResolvedValue({ success: true, data: accepted })
  ;(api.setAttendanceLocationConsent as jest.Mock).mockImplementation(async input => ({ success: true, data: { consent: { id: 'receipt-new', ...input, createdAt: timestamp } } }))
  ;(api.syncPush as jest.Mock).mockImplementation(async operations => ({ results: operations.map((item: {operationId: string}) => ({ operationId: item.operationId, status: 'ok' })) }))
  ;(readAttendanceLocationFix as jest.Mock).mockResolvedValue(fix)
  useWorkdayStore.setState({ activeWorkday: null, finishedWorkday: null, hydrated: true, syncError: null })
})
afterEach(() => jest.useRealTimers())
it('is strict about current principal, role, entitlement and protocol without changing field access', () => {
  expect(attendanceLocationAvailable()).toBe(true); expect(data.routeFieldAccess).toBe('unavailable')
  data.policies.attendanceMarkVersion = undefined; expect(attendanceLocationAvailable()).toBe(false)
  data.policies.attendanceMarkVersion = 1; data.manifest!.principal.id = 'other'; expect(attendanceLocationAvailable()).toBe(false)
  data.manifest!.principal.id = officeAgent.id; data.policies.agentPermissions!.attendanceLocation = false; expect(attendanceLocationAvailable()).toBe(false)
})
it.each([null, { ...accepted.policy!, enabled: false }])('keeps collection off without an enabled reviewed policy', async policy => {
  ;(api.getAttendanceLocationConsent as jest.Mock).mockResolvedValue({ success: true, data: { policy, consent: null, maySendLocation: false } })
  expect(await captureAttendanceMark(scope, timestamp, false)).toMatchObject({ locationState: 'NO_CONSENT', location: null, consentRevisionId: null })
  expect(readAttendanceLocationFix).not.toHaveBeenCalled()
})
it('does not infer consent from an enabled policy or malformed true', async () => {
  expect(() => parseOwnAttendanceLocation({ ...accepted, consent: null })).toThrow()
  ;(api.getAttendanceLocationConsent as jest.Mock).mockResolvedValue({ success: true, data: { ...accepted, consent: null, maySendLocation: false } })
  expect((await captureAttendanceMark(scope, timestamp, false))?.locationState).toBe('NO_CONSENT'); expect(readAttendanceLocationFix).not.toHaveBeenCalled()
})
it('attaches exact acceptance receipt, honest accuracy/mock/provider and no top-level coordinates', async () => {
  await useWorkdayStore.getState().start(scope)
  const [item] = await allOutboxOperations()
  expect(item.data).toMatchObject({ action: 'START', occurredAt: timestamp, attendanceMark: { version: 1, locationState: 'AVAILABLE', consentRevisionId: 'exact-receipt', location: fix } })
  expect(item.data.latitude).toBeUndefined(); expect(item.data.longitude).toBeUndefined()
})
it('does not capture for PAUSE, RESUME, or FINISH from a paused day', async () => {
  useWorkdayStore.setState({ activeWorkday: { key: scope, workdayId: 'workday', startedAt: timestamp, syncState: 'CONFIRMED' } })
  await useWorkdayStore.getState().pause(scope); await useWorkdayStore.getState().resume(scope); await useWorkdayStore.getState().pause(scope); await useWorkdayStore.getState().end(scope)
  const rows = await allOutboxOperations()
  expect(rows.slice(0,3).every(row => row.data.attendanceMark === undefined)).toBe(true)
  expect(rows[3].data.attendanceMark).toMatchObject({ locationState: 'NO_CONSENT', location: null })
  expect(readAttendanceLocationFix).not.toHaveBeenCalled(); expect(api.getAttendanceLocationConsent).not.toHaveBeenCalled()
})
it.each(['offline', 'no GPS'])('records canonical time despite %s', async reason => {
  if (reason === 'offline') (api.getAttendanceLocationConsent as jest.Mock).mockRejectedValue(new Error('offline'))
  else (readAttendanceLocationFix as jest.Mock).mockResolvedValue(null)
  await useWorkdayStore.getState().start(scope)
  expect((await allOutboxOperations())[0].data.occurredAt).toBe(timestamp)
  expect(useWorkdayStore.getState().activeWorkday?.syncState).toBe('START_PENDING')
})
it('rejects cached fixes from before the tap or consent and retains original tap time during capture', async () => {
  ;(readAttendanceLocationFix as jest.Mock).mockImplementation(async () => { jest.setSystemTime(new Date('2026-10-13T08:00:08Z')); return { ...fix, capturedAt: '2026-10-13T06:59:00Z' } })
  await useWorkdayStore.getState().start(scope)
  expect((await allOutboxOperations())[0].data).toMatchObject({ occurredAt: timestamp, attendanceMark: { locationState: 'UNAVAILABLE', location: null } })
})
it('withdraws in one durable queue write, preserves other accounts and binds unknown retry to the original envelope', async () => {
  setOfflineScope('other-org','other-agent'); const foreign = await enqueueOutboxOperation({ entity: 'workdays', op: 'create', data: { attendanceMark: { location: { latitude: 1 } } } })
  setOfflineScope(officeAgent.organizationId,officeAgent.id); await useWorkdayStore.getState().start(scope)
  const original = (await allOutboxOperations())[0]
  ;(api.syncPush as jest.Mock).mockRejectedValueOnce(new Error('lost reply'))
  await flushOutbox(pushAttendanceLocationOperations)
  ;(api.setAttendanceLocationConsent as jest.Mock).mockRejectedValueOnce(new Error('offline'))
  await expect(changeAttendanceConsent(scope, accepted, false)).rejects.toThrow('offline')
  const rows = await allOutboxOperations(), marked = rows.find(row => row.entity === 'workdays')!
  expect(marked.operationId).toBe(original.operationId); expect(marked.clientTimestamp).toBe(original.clientTimestamp)
  expect(marked.data).toEqual({ ...original.data, attendanceMark: { ...(original.data.attendanceMark as object), locationState: 'NO_CONSENT', consentRevisionId: null, location: null } })
  const input = (api.setAttendanceLocationConsent as jest.Mock).mock.calls[0][0]
  await sendAttendanceConsent(scope, (await pendingAttendanceConsent(scope))!)
  expect((api.setAttendanceLocationConsent as jest.Mock).mock.calls[1][0]).toEqual(input)
  await pushAttendanceLocationOperations([original]) // stale in-memory original must not leak
  expect((api.syncPush as jest.Mock).mock.calls.at(-1)![0][0].data).toEqual(marked.data)
  setOfflineScope('other-org','other-agent'); expect(await allOutboxOperations()).toEqual([foreign])
})
it('withdrawal during capture discards the fix and keeps future persisted workdays redacted', async () => {
  ;(readAttendanceLocationFix as jest.Mock).mockImplementation(async () => { await beginAttendanceConsent(scope, accepted, false); return fix })
  await useWorkdayStore.getState().start(scope)
  expect((await allOutboxOperations()).find(row => row.entity === 'workdays')!.data.attendanceMark).toMatchObject({ locationState: 'NO_CONSENT', location: null })
})
it('blocks a stale transmission if withdrawal occurs during asynchronous HTTP setup', async () => {
  await useWorkdayStore.getState().start(scope)
  ;(api.syncPush as jest.Mock).mockImplementation(async (_rows, guard) => { await beginAttendanceConsent(scope, accepted, false); guard(); throw new Error('must not send') })
  await expect(pushAttendanceLocationOperations(await allOutboxOperations())).rejects.toThrow('ATTENDANCE_CONSENT_CHANGED')
  expect((await allOutboxOperations()).find(row => row.entity === 'workdays')!.data.attendanceMark).toMatchObject({ location: null })
})
it('redacts after a remote revoke or a newer receipt instead of attributing old coordinates to new consent', async () => {
  await useWorkdayStore.getState().start(scope)
  ;(api.getAttendanceLocationConsent as jest.Mock).mockResolvedValue({ success: true, data: { ...accepted, consent: { ...accepted.consent!, id: 'later-receipt' } } })
  await pushAttendanceLocationOperations(await allOutboxOperations())
  expect((api.syncPush as jest.Mock).mock.calls[0][0][0].data.attendanceMark.location).toBeNull()
})
it('fails closed on a corrupt privacy queue without overwriting it or sending', async () => {
  await AsyncStorage.setItem('@mtm_sync_outbox_v1','{broken')
  await expect(queueAttendanceConsent(scope, {requestId: 'fake',policyRevisionId:'policy-one',expectedConsentId:null,accepted:false})).rejects.toThrow()
  expect(await AsyncStorage.getItem('@mtm_sync_outbox_v1')).toBe('{broken'); expect(api.setAttendanceLocationConsent).not.toHaveBeenCalled()
})
it('does not expose or accept a response after switching accounts', async () => {
  ;(api.getAttendanceLocationConsent as jest.Mock).mockImplementation(async () => { setOfflineScope('other','other'); return {success:true,data:accepted} })
  await expect(readAttendanceLocation(scope)).rejects.toThrow('ATTENDANCE_SCOPE_CHANGED')
  expect(readAttendanceLocationFix).not.toHaveBeenCalled()
})
it('blocks later capture/transmit even if the first withdrawal storage write fails', async () => {
  // Explicitly confirmed consent opens this process after previous withdrawals.
  const acceptedItem = await beginAttendanceConsent(scope, accepted, true); await sendAttendanceConsent(scope, acceptedItem)
  await useWorkdayStore.getState().start(scope); const original = await allOutboxOperations()
  ;(AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('storage unavailable'))
  await expect(beginAttendanceConsent(scope, accepted, false)).rejects.toThrow('storage unavailable')
  ;(readAttendanceLocationFix as jest.Mock).mockClear()
  expect((await captureAttendanceMark(scope, timestamp, false))?.locationState).toBe('NO_CONSENT')
  expect(readAttendanceLocationFix).not.toHaveBeenCalled()
  await pushAttendanceLocationOperations(original)
  expect((api.syncPush as jest.Mock).mock.calls.at(-1)![0][0].data.attendanceMark.location).toBeNull()
})
it.each(['MTM_ATTENDANCE_LOCATION_OUTSIDE_REJECTED', 'MTM_ATTENDANCE_LOCATION_MOCK_REJECTED'])('replaces an explicitly uncommitted %s with a new tap and preserves the original workday identity', async code => {
  await useWorkdayStore.getState().start(scope)
  const [original] = await allOutboxOperations()
  await markOutboxConflict(original.operationId, { operationId: original.operationId, status: 'conflict', error: code, serverData: { code, committed: false } })
  await useWorkdayStore.getState().reconcileFromServer(scope, null)
  jest.setSystemTime(new Date('2026-10-13T08:01:00Z'))
  ;(readAttendanceLocationFix as jest.Mock).mockResolvedValue({ ...fix, capturedAt: '2026-10-13T08:01:00.000Z' })
  await useWorkdayStore.getState().retryAttendanceMark(scope, original.operationId)
  const [retried] = await allOutboxOperations()
  expect(retried.operationId).not.toBe(original.operationId)
  expect(retried.data.id).toBe(original.data.id)
  expect(retried.data.occurredAt).toBe('2026-10-13T08:01:00.000Z')
  expect(retried.data.attendanceMark).toMatchObject({ consentRevisionId: 'exact-receipt', location: { capturedAt: '2026-10-13T08:01:00.000Z' } })
  expect(retried.status).toBe('pending'); expect(useWorkdayStore.getState().activeWorkday?.syncState).toBe('START_PENDING')
  // Losing the new reply retries the saved fresh tap, never takes another fix.
  ;(api.syncPush as jest.Mock).mockRejectedValueOnce(new Error('lost reply'))
  await flushOutbox(pushAttendanceLocationOperations)
  expect((await allOutboxOperations())[0].data).toEqual(retried.data)
  expect((await allOutboxOperations())[0].operationId).toBe(retried.operationId)
})
it.each([undefined, true, 'false'])('never replaces a mark without exact committed:false (%s)', async committed => {
  await useWorkdayStore.getState().start(scope); const [original] = await allOutboxOperations()
  await markOutboxConflict(original.operationId, { operationId: original.operationId, status: 'conflict', error: 'MTM_ATTENDANCE_LOCATION_OUTSIDE_REJECTED', serverData: { committed } })
  await expect(useWorkdayStore.getState().retryAttendanceMark(scope, original.operationId)).rejects.toThrow('ATTENDANCE_MARK_CHANGED')
  expect((await allOutboxOperations())[0].operationId).toBe(original.operationId)
})
it('serializes two retry taps and does not send a fix captured after scope is lost', async () => {
  await useWorkdayStore.getState().start(scope); const [original] = await allOutboxOperations()
  await markOutboxConflict(original.operationId, { operationId: original.operationId, status: 'conflict', error: 'MTM_ATTENDANCE_LOCATION_MOCK_REJECTED', serverData: { committed: false } })
  ;(readAttendanceLocationFix as jest.Mock).mockImplementation(async () => { data.policies.agentPermissions!.attendanceWorkday = false; return fix })
  await expect(useWorkdayStore.getState().retryAttendanceMark(scope, original.operationId)).rejects.toThrow()
  expect((await allOutboxOperations())[0].operationId).toBe(original.operationId)
  data.policies.agentPermissions!.attendanceWorkday = true; (readAttendanceLocationFix as jest.Mock).mockResolvedValue(fix)
  const results = await Promise.allSettled([useWorkdayStore.getState().retryAttendanceMark(scope, original.operationId), useWorkdayStore.getState().retryAttendanceMark(scope, original.operationId)])
  expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected'])
  expect(await allOutboxOperations()).toHaveLength(1)
})
it('withdrawal removes optional background evidence without deleting ordinary coordinates', async () => {
  const point = { latitude: 40.4, longitude: 49.8, clientLocationId: 'fictional-point', recordedAt: timestamp, isMock: false, attendanceConsentId: 'exact-receipt' }
  await queuePoint(point); await beginAttendanceConsent(scope, accepted, false)
  expect(await readQueue()).toEqual([{ latitude: 40.4, longitude: 49.8, clientLocationId: 'fictional-point', recordedAt: timestamp }])
})

it.each(['MTM_ATTENDANCE_INSTALLATION_APPROVAL_REQUIRED','MTM_ATTENDANCE_INSTALLATION_APP_REQUIRED'])('requires fresh installation approval before replacing %s',async code=>{
  data.policies.agentPermissions!.attendanceInstallation=true
  await useWorkdayStore.getState().start(scope);const first=(await allOutboxOperations())[0]
  await markOutboxConflict(first.operationId,{operationId:first.operationId,status:'conflict',error:code,serverData:{code,committed:false}})
  await useWorkdayStore.getState().reconcileFromServer(scope,null)
  const pending={required:true,installationLabel:'Fictional installation',state:'PENDING',requestId:'347bf275-448b-4e8f-b018-ad3571bb7b94',submittedAt:timestamp,decision:null,revocation:null,canRequest:false}
  ;(api.getAttendanceInstallation as jest.Mock).mockResolvedValue({success:true,data:pending})
  ;(readAttendanceLocationFix as jest.Mock).mockClear()
  await expect(useWorkdayStore.getState().retryAttendanceMark(scope,first.operationId)).rejects.toThrow('MTM_ATTENDANCE_INSTALLATION_APPROVAL_REQUIRED')
  expect(readAttendanceLocationFix).not.toHaveBeenCalled();expect((await allOutboxOperations())[0].operationId).toBe(first.operationId)
  ;(api.getAttendanceInstallation as jest.Mock).mockResolvedValue({success:true,data:{...pending,state:'APPROVED',decision:{action:'APPROVE',at:timestamp,reason:'Fictional approval'}}})
  const later='2026-10-13T08:01:00.000Z';jest.setSystemTime(new Date(later));(readAttendanceLocationFix as jest.Mock).mockResolvedValue({...fix,capturedAt:later})
  await useWorkdayStore.getState().retryAttendanceMark(scope,first.operationId)
  const next=(await allOutboxOperations())[0];expect(next.operationId).not.toBe(first.operationId);expect(next.data).toMatchObject({id:first.data.id,occurredAt:later});expect(readAttendanceLocationFix).toHaveBeenCalledTimes(1)
})
