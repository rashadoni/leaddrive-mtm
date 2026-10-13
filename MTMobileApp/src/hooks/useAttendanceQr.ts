import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../store/auth'
import { useBootstrapStore } from '../store/bootstrap'
import { workdayKey } from '../store/workday'
import { attendanceQrAvailable, readAttendanceQrReceipts, subscribeAttendanceQrReceipt } from '../services/attendance-qr'
import type { SavedAttendanceQrReceipt } from '../services/attendance-qr-contract'
export function useAttendanceQr(workdayId?: string) {
  const agent = useAuthStore(state=>state.agent), data = useBootstrapStore(state=>state.data)
  const scope = workdayKey(agent?.organizationId,agent?.id)
  // Subscribe to both live guards so a stale permission flag cannot keep the camera available.
  useAuthStore(state=>state.isLoggedIn)
  useBootstrapStore(state=>state.routeFieldAccess)
  const enabled = data?.policies.attendanceBranchQrVersion === 1 && data.policies.agentPermissions?.attendanceBranchQr === true && attendanceQrAvailable()
  const [view,setView] = useState<{scope:string;workdayId:string;rows:SavedAttendanceQrReceipt[]}>({scope:'',workdayId:'',rows:[]})
  const epoch = useRef(0)
  const reload = useCallback(async()=>{
    const ticket = ++epoch.current
    if (!enabled || !workdayId) { setView({scope,workdayId:workdayId ?? '',rows:[]}); return }
    try {
      if (!attendanceQrAvailable()) throw new Error('ATTENDANCE_QR_UNAVAILABLE')
      const rows = await readAttendanceQrReceipts(scope,workdayId)
      if (ticket === epoch.current) setView({scope,workdayId,rows})
    } catch { if (ticket === epoch.current) setView({scope,workdayId,rows:[]}) }
  },[scope,workdayId,enabled])
  useEffect(()=>{void reload();const unsubscribe=subscribeAttendanceQrReceipt(()=>{void reload()});return()=>{epoch.current++;unsubscribe()}},[reload])
  return {available:enabled,scope,receipts:enabled && view.scope===scope && view.workdayId===workdayId ? view.rows : [],reload}
}
