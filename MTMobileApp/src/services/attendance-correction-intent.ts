import { attendanceDate, attendanceUuid, type AttendanceInput } from './attendance-contract'

export type AttendanceCorrectionIntent = {
  requestKey: string; scope: string; server: string; timezone: string
  workDate: string; startedAt: string | null; completedAt: string | null
}
function civil(value: string | null | undefined, timezone: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return null
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value))
    const part = (key: string) => parts.find(row => row.type === key)?.value
    return { date: `${part('year')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}` }
  } catch { return null }
}
export function createAttendanceCorrectionIntent(scope: string, server: string, timezone: string | null | undefined,
  day: { workDate?: string; startedAt?: string; completedAt?: string } | null | undefined): AttendanceCorrectionIntent | null {
  if (!day || !scope || !server || !timezone) return null
  const workDate = day.workDate?.slice(0, 10) ?? civil(day.startedAt, timezone)?.date
  if (!attendanceDate(workDate ?? '')) return null
  return { requestKey: attendanceUuid(), scope, server, timezone, workDate: workDate!, startedAt: day.startedAt ?? null, completedAt: day.completedAt ?? null }
}
/** Navigation supplies only a suggestion. The existing request API remains
 * authoritative; no event or payroll data is changed by opening this form. */
export function attendanceCorrectionDraft(value: unknown, context: { scope: string; server: string; timezone: string | null | undefined }): AttendanceInput | null {
  if (!value || typeof value !== 'object') return null
  const intent = value as AttendanceCorrectionIntent
  if (intent.scope !== context.scope || intent.server !== context.server || intent.timezone !== context.timezone
    || typeof intent.requestKey !== 'string' || intent.requestKey.length > 100 || !intent.requestKey
    || typeof intent.workDate !== 'string' || !attendanceDate(intent.workDate)
    || (intent.startedAt !== null && typeof intent.startedAt !== 'string') || (intent.completedAt !== null && typeof intent.completedAt !== 'string')) return null
  const start = civil(intent.startedAt, intent.timezone), end = civil(intent.completedAt, intent.timezone)
  if ((intent.startedAt && !start) || (intent.completedAt && !end) || (start && start.date !== intent.workDate)) return null
  return { clientRequestId: attendanceUuid(), kind: 'TIME_CORRECTION', unit: 'HOURS', startDate: intent.workDate,
    endDate: end?.date ?? intent.workDate, ...(start ? { startTime: start.time } : {}), ...(end ? { endTime: end.time } : {}), reason: '', attachmentIds: [] }
}
