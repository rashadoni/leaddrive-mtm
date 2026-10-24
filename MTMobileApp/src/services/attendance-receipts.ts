import AsyncStorage from '@react-native-async-storage/async-storage'
import { useAuthStore } from '../store/auth'
import { useBootstrapStore } from '../store/bootstrap'
import { hasOfficeAttendanceAccess } from './attendance-access'
import { getOfflineScope, offlineScopeKey } from './offline-scope'
import { canonicalAttendanceReceipt, parseSavedAttendanceReceipt, type AttendanceDeliveryReceipt } from './attendance-receipt-contract'
import type { OutboxOperation, OutboxPushResult } from './outbox'

export type AttendanceReceiptAccount = { scope: string; server: string }
export function attendanceReceiptAccount(): AttendanceReceiptAccount | null {
  const auth = useAuthStore.getState(), scope = offlineScopeKey(auth.agent?.organizationId, auth.agent?.id)
  return auth.isLoggedIn && auth.serverDomain && scope && getOfflineScope() === scope && hasOfficeAttendanceAccess(useBootstrapStore.getState().data, auth.agent)
    ? { scope, server: auth.serverDomain } : null
}
function guard(account: AttendanceReceiptAccount) {
  const current = attendanceReceiptAccount()
  if (!current || current.scope !== account.scope || current.server !== account.server) throw new Error('ATTENDANCE_SCOPE_CHANGED')
}
const key = (account: AttendanceReceiptAccount) => `@mtm_attendance_delivery_v1:${JSON.stringify([account.server, account.scope])}`
let writes: Promise<void> = Promise.resolve()
const listeners = new Set<() => void>()
export function subscribeAttendanceReceipts(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
export async function readAttendanceReceipts(account: AttendanceReceiptAccount): Promise<AttendanceDeliveryReceipt[]> {
  guard(account)
  const raw = await AsyncStorage.getItem(key(account)); guard(account)
  if (raw === null) return []
  const value: unknown = JSON.parse(raw)
  if (!Array.isArray(value) || value.length > 64) throw new Error('ATTENDANCE_RECEIPT_INVALID')
  return value.map(parseSavedAttendanceReceipt)
}
/** Persist canonical delivery before ACK. A failed write retains the exact
 * operation for replay. A receipt is an observation at delivery, not live HR approval. */
export async function rememberAttendanceReceipts(account: AttendanceReceiptAccount, operations: readonly OutboxOperation[], results: readonly OutboxPushResult[], transportGuard?: () => void) {
  guard(account); transportGuard?.()
  const fresh: AttendanceDeliveryReceipt[] = []
  for (const result of results) {
    if (result.status !== 'ok' || result.serverData?.event === undefined) continue
    const operation = operations.find(row => row.operationId === result.operationId && row.scopeKey === account.scope && row.entity === 'workdays')
    if (!operation) continue // Other entities may also return an event.
    const receipt = canonicalAttendanceReceipt(operation, result)
    if (receipt) fresh.push(receipt)
  }
  if (!fresh.length) return
  const write = writes.then(async () => {
    guard(account); transportGuard?.()
    const existing = await readAttendanceReceipts(account)
    guard(account); transportGuard?.()
    for (const receipt of fresh) {
      const previous = existing.find(row => row.operationId === receipt.operationId)
      if (previous && JSON.stringify(previous) !== JSON.stringify(receipt)) throw new Error('ATTENDANCE_RECEIPT_CHANGED')
      if (!previous) existing.push(receipt)
    }
    await AsyncStorage.setItem(key(account), JSON.stringify(existing.slice(-64)))
    guard(account); transportGuard?.()
    for (const listener of listeners) { try { listener() } catch {} }
  })
  writes = write.then(() => undefined, () => undefined)
  return write
}
