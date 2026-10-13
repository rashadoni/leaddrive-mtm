import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAuthStore } from '../store/auth'
import { useBootstrapStore } from '../store/bootstrap'
import { getOfflineScope, offlineScopeKey } from './offline-scope'
import { attendanceMarkAvailable, guardAttendanceMark } from './attendance-location'
import { parseAttendanceQrReceipt, parseSavedAttendanceQrReceipt, validAttendanceQrToken, type AttendanceQrInput, type SavedAttendanceQrReceipt } from './attendance-qr-contract'
import type { OutboxOperation, OutboxPushResult } from './outbox'

export function attendanceQrAvailable() {
  const data = useBootstrapStore.getState().data
  return data?.policies.attendanceBranchQrVersion === 1 && data.policies.agentPermissions?.attendanceBranchQr === true && attendanceMarkAvailable()
}
export function guardAttendanceQr(scope: string) {
  guardAttendanceMark(scope)
  if (!attendanceQrAvailable()) throw new Error('ATTENDANCE_QR_UNAVAILABLE')
}
/** Only a new explicit action calls this. It never refreshes an existing token. */
export function newAttendanceQr(scope: string, token?: string | null): AttendanceQrInput | undefined {
  if (!attendanceQrAvailable()) {
    if (token !== undefined && token !== null) throw new Error('ATTENDANCE_QR_UNAVAILABLE')
    return undefined
  }
  guardAttendanceQr(scope)
  if (token != null && !validAttendanceQrToken(token)) throw new Error('ATTENDANCE_QR_INVALID')
  return {version:1,token:token ?? null}
}
function accountGuard(scope: string) {
  const auth = useAuthStore.getState()
  if (!auth.isLoggedIn || getOfflineScope() !== scope || offlineScopeKey(auth.agent?.organizationId,auth.agent?.id) !== scope) throw new Error('ATTENDANCE_SCOPE_CHANGED')
}
const key = (scope: string) => `@mtm_attendance_qr_receipts_v1:${scope}`
let writes: Promise<void> = Promise.resolve()
const listeners = new Set<() => void>()
export function subscribeAttendanceQrReceipt(listener: () => void) { listeners.add(listener); return () => {listeners.delete(listener)} }
async function read(scope: string): Promise<SavedAttendanceQrReceipt[]> {
  accountGuard(scope)
  const raw = await AsyncStorage.getItem(key(scope)); accountGuard(scope)
  if (raw === null) return []
  const value: unknown = JSON.parse(raw)
  if (!Array.isArray(value) || value.length > 64) throw new Error('ATTENDANCE_QR_RECEIPT_INVALID')
  return value.map(parseSavedAttendanceQrReceipt)
}
export async function readAttendanceQrReceipts(scope: string, workdayId: string) {
  guardAttendanceMark(scope)
  const rows = await read(scope); guardAttendanceMark(scope)
  return rows.filter(row => row.workdayId === workdayId)
}
/** Commit safe canonical receipts before outbox ACK. Failure retains exact retry.
 * No rule/consent gate here: an accepted replay remains valid after policy OFF.
 * Raw QR tokens are never copied from the operation into this cache. */
export async function rememberAttendanceQrReceipts(scope: string, operations: readonly OutboxOperation[], results: readonly OutboxPushResult[], guard?: () => void) {
  const fresh: SavedAttendanceQrReceipt[] = []
  for (const result of results) {
    if (result.status !== 'ok' || result.serverData?.attendanceQr === undefined) continue
    const operation = operations.find(item => item.operationId === result.operationId && item.scopeKey === scope && item.entity === 'workdays')
    if (!operation || !['START','FINISH'].includes(String(operation.data.action))) throw new Error('ATTENDANCE_QR_RECEIPT_UNBOUND')
    fresh.push(parseSavedAttendanceQrReceipt({...parseAttendanceQrReceipt(result.serverData.attendanceQr),operationId:operation.operationId,
      workdayId:operation.data.action === 'START' ? operation.data.id : operation.data.workdayId,action:operation.data.action,occurredAt:operation.data.occurredAt}))
  }
  if (!fresh.length) return
  const write = writes.then(async () => {
    guard?.(); accountGuard(scope)
    const existing = await read(scope); guard?.(); accountGuard(scope)
    for (const item of fresh) {
      const previous = existing.find(row => row.operationId === item.operationId)
      if (previous && JSON.stringify(previous) !== JSON.stringify(item)) throw new Error('ATTENDANCE_QR_RECEIPT_CHANGED')
      if (!previous) existing.push(item)
    }
    await AsyncStorage.setItem(key(scope),JSON.stringify(existing.slice(-64))); guard?.(); accountGuard(scope)
    listeners.forEach(listener => listener())
  })
  writes = write.then(()=>undefined,()=>undefined)
  return write
}
