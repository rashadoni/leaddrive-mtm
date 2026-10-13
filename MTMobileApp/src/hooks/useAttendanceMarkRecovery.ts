import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../store/auth'
import { useBootstrapStore } from '../store/bootstrap'
import { useWorkdayStore, workdayKey } from '../store/workday'
import { useSyncStatusStore } from '../store/sync-status'
import { allOutboxOperations, type OutboxOperation } from '../services/outbox'
import { attendanceMarkRejection } from '../services/attendance-mark-recovery'
import { guardAttendanceMark } from '../services/attendance-location'

function day(value: string, timezone: string | null) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone ?? 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value)) } catch { return '' }
}
export function useAttendanceMarkRecovery() {
  const agent = useAuthStore(state => state.agent), bootstrap = useBootstrapStore(state => state.data)
  const active = useWorkdayStore(state => state.activeWorkday), conflicts = useSyncStatusStore(state => state.conflicts)
  const key = workdayKey(agent?.organizationId, agent?.id)
  const [operation, setOperation] = useState<OutboxOperation | null>(null)
  const epoch = useRef(0)
  const available = bootstrap?.policies.attendanceMarkVersion === 1 && bootstrap.policies.agentPermissions?.attendanceWorkday === true
  const reload = useCallback(async () => {
    const ticket = ++epoch.current
    if (!available) { setOperation(null); return }
    try {
      guardAttendanceMark(key)
      const items = await allOutboxOperations(); guardAttendanceMark(key)
      if (ticket !== epoch.current) return
      const today = day(new Date().toISOString(), bootstrap?.timezone ?? null)
      setOperation(items.find(item => item.scopeKey === key && attendanceMarkRejection(item)
        && (active?.key === key ? item.data.workdayId === active.workdayId || item.data.id === active.workdayId
          : item.data.action === 'START' && typeof item.data.occurredAt === 'string' && day(item.data.occurredAt, bootstrap?.timezone ?? null) === today)) ?? null)
    } catch { if (ticket === epoch.current) setOperation(null) }
  }, [available, key, bootstrap, active])
  useEffect(() => { void reload(); return () => { epoch.current += 1 } }, [reload, conflicts])
  return { operation: available && operation?.scopeKey === key ? operation : null, reload }
}
