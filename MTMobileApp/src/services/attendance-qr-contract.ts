export type AttendanceQrInput = { version: 1; token: string | null }
export type AttendanceQrState = 'VERIFIED' | 'NOT_PROVIDED' | 'EXPIRED' | 'INVALID' | 'BRANCH_CHANGED' | 'REUSED'
export type AttendanceQrReceipt = { eventId: string; state: AttendanceQrState; branch: { id: string; name: string } | null }
export type SavedAttendanceQrReceipt = AttendanceQrReceipt & { operationId: string; workdayId: string; action: 'START' | 'FINISH'; occurredAt: string }
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 191
export const validAttendanceQrToken = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 4096
export function parseAttendanceQrReceipt(value: unknown): AttendanceQrReceipt {
  const row = object(value), branch = object(row?.branch)
  if (!row || !id(row.eventId) || !['VERIFIED','NOT_PROVIDED','EXPIRED','INVALID','BRANCH_CHANGED','REUSED'].includes(String(row.state))
    || (row.state === 'VERIFIED' ? !branch || !id(branch.id) || typeof branch.name !== 'string' || !branch.name.trim() || branch.name.length > 300 : row.branch !== null)) throw new Error('ATTENDANCE_QR_RECEIPT_INVALID')
  return { eventId: row.eventId, state: row.state as AttendanceQrState, branch: branch ? {id:branch.id as string,name:branch.name as string} : null }
}
export function parseSavedAttendanceQrReceipt(value: unknown): SavedAttendanceQrReceipt {
  const row = object(value)
  if (!row || !id(row.operationId) || !id(row.workdayId) || !['START','FINISH'].includes(String(row.action)) || typeof row.occurredAt !== 'string' || !Number.isFinite(Date.parse(row.occurredAt))) throw new Error('ATTENDANCE_QR_RECEIPT_INVALID')
  return {...parseAttendanceQrReceipt(row),operationId:row.operationId,workdayId:row.workdayId,action:row.action as 'START'|'FINISH',occurredAt:row.occurredAt}
}
