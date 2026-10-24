import type { OutboxOperation, OutboxPushResult } from './outbox'

export const ATTENDANCE_MARK_ACTIONS = ['START', 'PAUSE', 'RESUME', 'FINISH'] as const
export type AttendanceMarkAction = typeof ATTENDANCE_MARK_ACTIONS[number]
export type AttendanceDeliveryReceipt = {
  operationId: string; eventId: string; workdayId: string; action: AttendanceMarkAction
  occurredAt: string; receivedAt: string | null
  review: 'PENDING_REVIEW' | 'NOT_REQUIRED' | 'LEGACY_UNKNOWN'
}
export type AttendanceReceiptRow = {
  operationId: string; workdayId: string; action: AttendanceMarkAction; occurredAt: string
  delivery: 'LOCAL' | 'CONFLICT' | 'RECEIVED'; receivedAt: string | null
  review: AttendanceDeliveryReceipt['review'] | null
}
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 191
const instant = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
const action = (value: unknown): value is AttendanceMarkAction => ATTENDANCE_MARK_ACTIONS.includes(value as AttendanceMarkAction)
const sameTime = (a: unknown, b: unknown) => instant(a) && instant(b) && Date.parse(a) === Date.parse(b)

export function parseSavedAttendanceReceipt(value: unknown): AttendanceDeliveryReceipt {
  const row = object(value)
  if (!row || !id(row.operationId) || !id(row.eventId) || !id(row.workdayId) || !action(row.action) || !instant(row.occurredAt)
    || (row.receivedAt !== null && !instant(row.receivedAt)) || !['PENDING_REVIEW', 'NOT_REQUIRED', 'LEGACY_UNKNOWN'].includes(String(row.review))) {
    throw new Error('ATTENDANCE_RECEIPT_INVALID')
  }
  // Explicit allow-list: no coordinates, QR tokens, request hashes or notes.
  return { operationId: row.operationId, eventId: row.eventId, workdayId: row.workdayId, action: row.action,
    occurredAt: new Date(row.occurredAt).toISOString(), receivedAt: row.receivedAt === null ? null : new Date(row.receivedAt as string).toISOString(),
    review: row.review as AttendanceDeliveryReceipt['review'] }
}

export function canonicalAttendanceReceipt(operation: OutboxOperation, result: OutboxPushResult): AttendanceDeliveryReceipt | null {
  if (operation.entity !== 'workdays' || !action(operation.data.action) || result.status !== 'ok') return null
  // Old servers without a canonical event do not supply a delivery receipt.
  if (result.serverData?.event === undefined) return null
  const event = object(result.serverData.event), review = object(result.serverData.review)
  const workdayId = operation.data.action === 'START' ? operation.data.id : operation.data.workdayId
  if (!event || result.operationId !== operation.operationId || event.clientEventId !== operation.operationId
    || event.workdayId !== workdayId || event.type !== operation.data.action
    || !sameTime(event.claimedAt ?? event.occurredAt, operation.data.occurredAt)) throw new Error('ATTENDANCE_RECEIPT_UNBOUND')
  return parseSavedAttendanceReceipt({ operationId: operation.operationId, eventId: event.id, workdayId, action: event.type,
    occurredAt: event.claimedAt ?? event.occurredAt, receivedAt: event.serverReceivedAt ?? null,
    review: review?.state ?? 'LEGACY_UNKNOWN' })
}

/** Delivery order is retained. Phone wall-clock order is not causal evidence. */
export function attendanceReceiptRows(scope: string, receipts: readonly AttendanceDeliveryReceipt[], operations: readonly OutboxOperation[]): AttendanceReceiptRow[] {
  const rows: AttendanceReceiptRow[] = receipts.map(row => ({ ...row, delivery: 'RECEIVED' }))
  const received = new Set(rows.map(row => row.operationId))
  for (const item of operations) {
    if (item.scopeKey !== scope || item.entity !== 'workdays' || received.has(item.operationId) || !action(item.data.action) || !instant(item.data.occurredAt)) continue
    const workdayId = item.data.action === 'START' ? item.data.id : item.data.workdayId
    if (!id(workdayId)) continue
    rows.push({ operationId: item.operationId, workdayId, action: item.data.action, occurredAt: item.data.occurredAt,
      delivery: item.status === 'conflict' ? 'CONFLICT' : 'LOCAL', receivedAt: null, review: null })
  }
  return rows
}
