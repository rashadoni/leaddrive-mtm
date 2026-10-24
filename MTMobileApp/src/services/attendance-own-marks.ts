import { api } from './api'
import { attendanceReceiptAccount, type AttendanceReceiptAccount } from './attendance-receipts'
import { guardOfficeAttendance } from './attendance-session-guard'

export type OwnAttendanceMark = {
  eventId: string; action: 'START' | 'PAUSE' | 'RESUME' | 'FINISH'; claimedAt: string; serverReceivedAt: string | null
  location: { state: string; coordinates: { latitude: number; longitude: number } | null; accuracyMeters: number | null; capturedAt: string | null; branchName: string | null; distanceMeters: number | null }
  qr: { state: string; branchName: string | null } | null
  review: { openCases: number; closedCases: number }
}
export type OwnAttendanceMarks = { workdayId: string; workDate: string; timezone: string; updatedAt: string; hasMore: boolean; items: OwnAttendanceMark[] }
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const instant = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0
const measure = (value: unknown) => value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0)
const name = (value: unknown) => value === null || (typeof value === 'string' && value.length <= 300)
const fail = (): never => { throw new Error('ATTENDANCE_MARKS_INVALID') }
export function parseOwnAttendanceMarks(value: unknown, workdayId: string): OwnAttendanceMarks {
  const data = object(value)
  if (!data || data.workdayId !== workdayId || typeof data.workDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.workDate)
    || typeof data.timezone !== 'string' || !instant(data.updatedAt) || typeof data.hasMore !== 'boolean' || !Array.isArray(data.items) || data.items.length > 64) return fail()
  try { new Intl.DateTimeFormat('en', { timeZone: data.timezone }).format() } catch { return fail() }
  const seen = new Set<string>()
  const items = data.items.map(value => {
    const row = object(value), location = object(row?.location), review = object(row?.review), qr = object(row?.qr)
    if (!row || typeof row.eventId !== 'string' || !row.eventId || seen.has(row.eventId) || !['START', 'PAUSE', 'RESUME', 'FINISH'].includes(String(row.action))
      || !instant(row.claimedAt) || (row.serverReceivedAt !== null && !instant(row.serverReceivedAt)) || !location
      || !['INSIDE', 'OUTSIDE', 'UNCERTAIN', 'UNCONFIGURED', 'UNAVAILABLE', 'NO_CONSENT', 'NOT_RECORDED'].includes(String(location.state))
      || !name(location.branchName) || !measure(location.accuracyMeters) || !measure(location.distanceMeters)
      || (location.capturedAt !== null && !instant(location.capturedAt)) || !review || !count(review.openCases) || !count(review.closedCases)
      || (row.qr !== null && (!qr || !['VERIFIED', 'NOT_PROVIDED', 'EXPIRED', 'INVALID', 'BRANCH_CHANGED', 'REUSED'].includes(String(qr.state)) || !name(qr.branchName)))) return fail()
    const position = object(location.coordinates)
    if (location.coordinates !== null && (!position || typeof position.latitude !== 'number' || !Number.isFinite(position.latitude) || Math.abs(position.latitude) > 90
      || typeof position.longitude !== 'number' || !Number.isFinite(position.longitude) || Math.abs(position.longitude) > 180)) return fail()
    const endpoint = row.action === 'START' || row.action === 'FINISH'
    if (!endpoint && (location.state !== 'NOT_RECORDED' || position || row.qr !== null || location.branchName !== null
      || location.accuracyMeters !== null || location.distanceMeters !== null || location.capturedAt !== null)) return fail()
    if (!position && (location.accuracyMeters !== null || location.capturedAt !== null)) return fail()
    if (qr && qr.state !== 'VERIFIED' && qr.branchName !== null) return fail()
    if (position && !['INSIDE', 'OUTSIDE', 'UNCERTAIN', 'UNCONFIGURED'].includes(String(location.state))) return fail()
    seen.add(row.eventId)
    return { eventId: row.eventId, action: row.action as OwnAttendanceMark['action'], claimedAt: row.claimedAt, serverReceivedAt: row.serverReceivedAt as string | null,
      location: { state: String(location.state), coordinates: position ? { latitude: position.latitude as number, longitude: position.longitude as number } : null,
        accuracyMeters: location.accuracyMeters as number | null, capturedAt: location.capturedAt as string | null, branchName: location.branchName as string | null, distanceMeters: location.distanceMeters as number | null },
      qr: qr ? { state: String(qr.state), branchName: qr.branchName as string | null } : null,
      review: { openCases: review.openCases, closedCases: review.closedCases } }
  })
  return { workdayId, workDate: data.workDate, timezone: data.timezone, updatedAt: data.updatedAt, hasMore: data.hasMore, items }
}
/** Coordinates stay in the open screen's memory, never in receipt storage. */
export async function loadOwnAttendanceMarks(account: AttendanceReceiptAccount, workdayId: string, screenGuard: () => void) {
  const guard = () => {
    screenGuard(); guardOfficeAttendance(account.scope)
    const current = attendanceReceiptAccount()
    if (current?.scope !== account.scope || current.server !== account.server) throw new Error('ATTENDANCE_SCOPE_CHANGED')
  }
  guard()
  const response = await api.getOwnAttendanceMarks(workdayId, guard); guard()
  if (!response?.success) throw new Error('ATTENDANCE_MARKS_UNAVAILABLE')
  return parseOwnAttendanceMarks(response.data, workdayId)
}
