jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('../../src/store/auth', () => ({ useAuthStore: { getState: jest.fn() } }))
jest.mock('../../src/store/bootstrap', () => ({ useBootstrapStore: { getState: jest.fn() } }))
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAuthStore } from '../../src/store/auth'
import { useBootstrapStore } from '../../src/store/bootstrap'
import { officeAgent, officeBootstrap } from '../../test-support/office-attendance'
import { setOfflineScope } from '../../src/services/offline-scope'
import { attendanceReceiptAccount, readAttendanceReceipts, rememberAttendanceReceipts } from '../../src/services/attendance-receipts'
import { attendanceReceiptRows, canonicalAttendanceReceipt } from '../../src/services/attendance-receipt-contract'
import type { OutboxOperation, OutboxPushResult } from '../../src/services/outbox'

const scope = `${officeAgent.organizationId}:${officeAgent.id}`, account = { scope, server: 'fixture.invalid' }
const mark: OutboxOperation = { operationId: 'mark-1', entity: 'workdays', op: 'create', scopeKey: scope, status: 'pending', attempts: 0, nextAttemptAt: 0, clientTimestamp: 1,
  data: { id: 'day-1', action: 'START', occurredAt: '2026-10-22T05:02:00+00:00', attendanceMark: { location: { latitude: 40.5, longitude: 49.5 } }, attendanceQr: { token: 'private-code' } } }
const result: OutboxPushResult = { operationId: 'mark-1', status: 'ok', serverData: {
  event: { id: 'event-1', workdayId: 'day-1', clientEventId: 'mark-1', type: 'START', claimedAt: '2026-10-22T05:02:00.000Z', serverReceivedAt: '2026-10-22T07:00:00Z', latitude: 40.5, note: 'private-note', requestHash: 'private-hash' },
  review: { state: 'PENDING_REVIEW', reasonCode: 'DELAYED_CLAIM' },
} }
let auth: { isLoggedIn: boolean; serverDomain: string; agent: typeof officeAgent }
let bootstrap = officeBootstrap()
beforeEach(async () => {
  jest.clearAllMocks(); await AsyncStorage.clear(); setOfflineScope(officeAgent.organizationId, officeAgent.id)
  auth = { isLoggedIn: true, serverDomain: account.server, agent: officeAgent }; bootstrap = officeBootstrap()
  ;(useAuthStore.getState as jest.Mock).mockImplementation(() => auth)
  ;(useBootstrapStore.getState as jest.Mock).mockImplementation(() => ({ data: bootstrap }))
})
it('keeps original and server times across restart/replay without copying private evidence', async () => {
  await rememberAttendanceReceipts(account, [mark], [result])
  await rememberAttendanceReceipts(account, [mark], [result])
  const saved = await readAttendanceReceipts(account)
  expect(saved).toEqual([{ operationId: 'mark-1', eventId: 'event-1', workdayId: 'day-1', action: 'START', occurredAt: '2026-10-22T05:02:00.000Z', receivedAt: '2026-10-22T07:00:00.000Z', review: 'PENDING_REVIEW' }])
  expect(JSON.stringify(saved)).not.toMatch(/latitude|longitude|private-|requestHash|token/)
  expect(attendanceReceiptRows(scope, saved, [mark])).toHaveLength(1)
  expect(attendanceReceiptRows(scope, saved, [mark])[0].delivery).toBe('RECEIVED')
})
it.each(['clientEventId', 'workdayId', 'type', 'claimedAt'])('refuses a receipt bound to a different %s', field => {
  const event = { ...result.serverData!.event as object, [field]: field === 'claimedAt' ? '2026-10-21T00:00:00Z' : 'different' }
  expect(() => canonicalAttendanceReceipt(mark, { ...result, serverData: { ...result.serverData, event } })).toThrow('ATTENDANCE_RECEIPT_UNBOUND')
})
it('never manufactures delivery from an absent response, conflict or old server', async () => {
  await rememberAttendanceReceipts(account, [mark], [{ ...result, status: 'conflict' }, { ...result, serverData: {} }])
  expect(await readAttendanceReceipts(account)).toEqual([])
  const foreign = { ...mark, operationId: 'foreign', scopeKey: 'other:person' }
  expect(attendanceReceiptRows(scope, [], [mark, foreign])).toEqual([expect.objectContaining({ delivery: 'LOCAL', receivedAt: null, review: null })])
  expect(attendanceReceiptRows(scope, [], [{ ...mark, status: 'conflict' }])[0].delivery).toBe('CONFLICT')
})
it('preserves receipt order even when the phone clock goes backwards', () => {
  const pause: OutboxOperation = { ...mark, operationId: 'pause', data: { action: 'PAUSE', workdayId: 'day-1', occurredAt: '2026-10-22T04:00:00Z' } }
  expect(attendanceReceiptRows(scope, [], [mark, pause]).map(row => row.action)).toEqual(['START', 'PAUSE'])
})
it('propagates storage failure before ACK and permits the exact retry', async () => {
  ;(AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'))
  await expect(rememberAttendanceReceipts(account, [mark], [result])).rejects.toThrow('disk full')
  expect(await readAttendanceReceipts(account)).toEqual([])
  await rememberAttendanceReceipts(account, [mark], [result])
  expect(await readAttendanceReceipts(account)).toHaveLength(1)
})
it('does not overwrite a changed canonical receipt', async () => {
  await rememberAttendanceReceipts(account, [mark], [result])
  await expect(rememberAttendanceReceipts(account, [mark], [{ ...result, serverData: { ...result.serverData, event: { ...result.serverData!.event as object, serverReceivedAt: '2026-10-22T08:00:00Z' } } }])).rejects.toThrow('ATTENDANCE_RECEIPT_CHANGED')
})
it('separates identical employee IDs on different servers and refuses a late server switch', async () => {
  await rememberAttendanceReceipts(account, [mark], [result])
  auth.serverDomain = 'other.invalid'
  expect(await readAttendanceReceipts({ ...account, server: auth.serverDomain })).toEqual([])
  await expect(rememberAttendanceReceipts(account, [mark], [result])).rejects.toThrow('ATTENDANCE_SCOPE_CHANGED')
})
it('refuses logout or permission withdrawal during a pending read', async () => {
  ;(AsyncStorage.getItem as jest.Mock).mockImplementationOnce(async () => { auth.isLoggedIn = false; return null })
  await expect(rememberAttendanceReceipts(account, [mark], [result])).rejects.toThrow('ATTENDANCE_SCOPE_CHANGED')
  expect(AsyncStorage.setItem).not.toHaveBeenCalled()
  auth.isLoggedIn = true; bootstrap.policies.agentPermissions!.attendanceWorkday = false
  expect(attendanceReceiptAccount()).toBeNull()
})
it('does not infer a received time or an HR approval for legacy provenance', () => {
  const event = { ...result.serverData!.event as object, serverReceivedAt: null }
  expect(canonicalAttendanceReceipt(mark, { ...result, serverData: { event } })).toMatchObject({ receivedAt: null, review: 'LEGACY_UNKNOWN' })
})
