import type { ActiveWorkday } from '../store/workday'
import type { OutboxOperation } from './outbox'

/** Rebuild a provisional UI after a crash between durable enqueue and the
 * separate UI snapshot write. Journal order, never wall-clock sort, is causal. */
export function projectAttendanceWorkday(scope: string, base: ActiveWorkday | null, rows: OutboxOperation[]): ActiveWorkday | null {
  const own = rows.filter(row => row.scopeKey === scope && row.entity === 'workdays')
  let day = base?.key === scope ? { ...base } : null
  if (!day) {
    const start = own.find(row => row.data.action === 'START' && typeof row.data.id === 'string' && typeof row.data.occurredAt === 'string')
    if (start) day = { key: scope, workdayId: String(start.data.id), startedAt: String(start.data.occurredAt), syncState: 'START_PENDING' }
  }
  if (!day) return null
  const events = own.filter(row => (row.data.id ?? row.data.workdayId) === day!.workdayId)
  for (const row of events) {
    const at = row.data.occurredAt
    if (typeof at !== 'string' || !Number.isFinite(Date.parse(at))) throw new Error('ATTENDANCE_QUEUE_INVALID')
    if (row.data.action === 'START') day = { ...day, syncState: 'START_PENDING' }
    if (row.data.action === 'PAUSE') day = { ...day, paused: true, pausedAt: at }
    if (row.data.action === 'RESUME') { delete day.paused; delete day.pausedAt }
    if (row.data.action === 'FINISH') day = { ...day, syncState: 'FINISH_PENDING', lastMarkAt: at }
  }
  return day
}
