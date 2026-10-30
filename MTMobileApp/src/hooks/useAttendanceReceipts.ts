import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../store/auth'
import { useBootstrapStore } from '../store/bootstrap'
import { hasOfficeAttendanceAccess } from '../services/attendance-access'
import { attendanceReceiptAccount, readAttendanceReceipts, subscribeAttendanceReceipts } from '../services/attendance-receipts'
import { attendanceReceiptRows, type AttendanceReceiptRow } from '../services/attendance-receipt-contract'
import { allOutboxOperations, subscribeOutboxChanges } from '../services/outbox'

export function useAttendanceReceipts() {
  const auth = useAuthStore(), data = useBootstrapStore(state => state.data)
  const enabled = auth.isLoggedIn && hasOfficeAttendanceAccess(data, auth.agent)
  const identity = JSON.stringify([auth.serverDomain, auth.agent?.organizationId, auth.agent?.id, enabled])
  const [view, setView] = useState<{ identity: string; rows: AttendanceReceiptRow[]; failed: boolean }>({ identity: '', rows: [], failed: false })
  const epoch = useRef(0)
  const reload = useCallback(async () => {
    const ticket = ++epoch.current, account = enabled ? attendanceReceiptAccount() : null
    if (!account) { setView({ identity, rows: [], failed: false }); return }
    try {
      const [saved, queue] = await Promise.all([readAttendanceReceipts(account), allOutboxOperations()])
      const current = attendanceReceiptAccount()
      if (ticket === epoch.current && current?.scope === account.scope && current.server === account.server) {
        setView({ identity, rows: attendanceReceiptRows(account.scope, saved, queue), failed: false })
      }
    } catch { if (ticket === epoch.current) setView({ identity, rows: [], failed: true }) }
  }, [identity, enabled])
  useEffect(() => {
    void reload()
    const receipt = subscribeAttendanceReceipts(() => { void reload() }), queue = subscribeOutboxChanges(() => { void reload() })
    return () => { epoch.current++; receipt(); queue() }
  }, [reload])
  return { rows: enabled && view.identity === identity ? view.rows : [], failed: enabled && view.identity === identity && view.failed, reload }
}
