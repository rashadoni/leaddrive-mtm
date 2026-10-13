import type { OutboxOperation } from './outbox'

export function attendanceMarkRejection(item: OutboxOperation): 'outside' | 'mock' | null {
  if (item.entity !== 'workdays' || item.status !== 'conflict' || !['START', 'FINISH'].includes(String(item.data.action))) return null
  const code = item.conflict?.error ?? item.conflict?.serverData?.code
  if (code === 'MTM_ATTENDANCE_LOCATION_OUTSIDE_REJECTED') return 'outside'
  if (code === 'MTM_ATTENDANCE_LOCATION_MOCK_REJECTED') return 'mock'
  return null
}

/** Only an explicit transaction rollback allows replacement with fresh facts.
 * An absent/unknown receipt is still the original operation's exact retry. */
export function canReplaceAttendanceMark(item: OutboxOperation): boolean {
  return attendanceMarkRejection(item) !== null && item.conflict?.serverData?.committed === false
}
