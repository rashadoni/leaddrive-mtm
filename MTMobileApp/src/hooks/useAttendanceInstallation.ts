import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../store/auth'
import { useBootstrapStore } from '../store/bootstrap'
import { workdayKey } from '../store/workday'
import { attendanceInstallationScope, beginAttendanceInstallation, pendingAttendanceInstallation, readAttendanceInstallation, sendAttendanceInstallation } from '../services/attendance-installation'
import type { AttendanceInstallation, PendingAttendanceInstallation } from '../services/attendance-installation-contract'
export function useAttendanceInstallation() {
  const agent=useAuthStore(state=>state.agent),data=useBootstrapStore(state=>state.data)
  const scope=workdayKey(agent?.organizationId,agent?.id)
  const available=data?.policies.agentPermissions?.attendanceInstallation===true && data.policies.attendanceMarkVersion===1
  const [view,setView]=useState<{scope:string;own:AttendanceInstallation|null;pending:PendingAttendanceInstallation|null;required:boolean|null}>({scope:'',own:null,pending:null,required:null})
  const [busy,setBusy]=useState(false),[failed,setFailed]=useState(false)
  const epoch=useRef(0),writing=useRef(false)
  const load=useCallback(async()=>{
    const ticket=++epoch.current
    if(!available){setView({scope,own:null,pending:null,required:null});return}
    setBusy(true);setFailed(false)
    try {
      const current=attendanceInstallationScope()
      if(current!==scope)throw new Error('ATTENDANCE_SCOPE_CHANGED')
      const pending=await pendingAttendanceInstallation(scope)
      if(ticket!==epoch.current)return
      setView(before=>({scope,own:before.scope===scope?before.own:null,pending,required:before.scope===scope?before.required:null}))
      const own=await readAttendanceInstallation(scope)
      if(ticket===epoch.current)setView({scope,own,pending,required:own.required})
    }catch(error){if(ticket===epoch.current){setFailed(true);if([401,403,404].includes((error as {status?:number})?.status??0))setView({scope,own:null,pending:null,required:null})}}
    finally{if(ticket===epoch.current)setBusy(false)}
  },[available,scope])
  useEffect(()=>{writing.current=false;setView({scope,own:null,pending:null,required:null});if(available)void load();return()=>{epoch.current+=1}},[available,scope,load])
  const current=available && view.scope===scope ? view : {own:null,pending:null,required:null}
  async function submit() {
    if(writing.current||busy||!available||(!current.pending&&!current.own?.canRequest))return
    const ticket=epoch.current
    writing.current=true;setBusy(true);setFailed(false)
    try{
      if(attendanceInstallationScope()!==scope)throw new Error('ATTENDANCE_SCOPE_CHANGED')
      const pending=current.pending??await beginAttendanceInstallation(scope)
      if(ticket!==epoch.current)return
      setView(before=>({...before,scope,pending}))
      await sendAttendanceInstallation(scope,pending)
      if(ticket!==epoch.current)return
      // The POST receipt can describe an older request; only GET is latest.
      setView(before=>({...before,pending:null,own:null}));writing.current=false;await load()
    }catch(error){if(ticket===epoch.current){setFailed(true)
      if([401,403,404].includes((error as {status?:number})?.status??0))setView({scope,own:null,pending:null,required:null})
      else try{const pending=await pendingAttendanceInstallation(scope);if(ticket===epoch.current)setView(before=>({...before,scope,pending}))}catch{/* Pending receipt is never recreated from GET. */}
    }}finally{if(ticket===epoch.current){writing.current=false;setBusy(false)}}
  }
  return {visible:available && current.required!==false && (current.required===true || !!current.pending),blocked:available && current.required===true && current.own?.state!=='APPROVED',own:current.own,pending:current.pending,busy,failed,submit,reload:load}
}
