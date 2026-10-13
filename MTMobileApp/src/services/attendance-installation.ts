import AsyncStorage from '@react-native-async-storage/async-storage'
import { api } from './api'
import { attendanceMarkAvailable, guardAttendanceMark } from './attendance-location'
import { useBootstrapStore } from '../store/bootstrap'
import { getOfflineScope } from './offline-scope'
import { getFieldDeviceId } from './field-device-id'
import { attendanceUuid } from './attendance-contract'
import { installationRequestUuid, parseAttendanceInstallation, type PendingAttendanceInstallation } from './attendance-installation-contract'
export function attendanceInstallationAvailable() {
  return attendanceMarkAvailable() && useBootstrapStore.getState().data?.policies.agentPermissions?.attendanceInstallation === true
}
export function guardAttendanceInstallation(scope: string) {
  guardAttendanceMark(scope)
  if (!attendanceInstallationAvailable()) throw Object.assign(new Error('ATTENDANCE_INSTALLATION_UNAVAILABLE'),{status:403})
}
export function attendanceInstallationScope() { const scope=getOfflineScope(); if(!scope) throw new Error('ATTENDANCE_SCOPE_CHANGED'); guardAttendanceInstallation(scope); return scope }
const key = (scope: string, installationId: string) => `@mtm_attendance_installation_pending_v1:${scope}:${installationId}`
let writes: Promise<void> = Promise.resolve()
function mutate<T>(run:()=>Promise<T>):Promise<T> { const next=writes.then(run); writes=next.then(()=>undefined,()=>undefined); return next }
async function context(scope:string) {
  guardAttendanceInstallation(scope); const installationId=await getFieldDeviceId(); guardAttendanceInstallation(scope)
  return {storageKey:key(scope,installationId),guard:()=>guardAttendanceInstallation(scope)}
}
async function read(storageKey:string):Promise<PendingAttendanceInstallation|null> {
  const raw=await AsyncStorage.getItem(storageKey); if(raw===null)return null
  const value=JSON.parse(raw)
  if (!value || !installationRequestUuid(value.requestId) || typeof value.createdAt!=='string' || !Number.isFinite(Date.parse(value.createdAt))) throw new Error('ATTENDANCE_INSTALLATION_PENDING_INVALID')
  return {requestId:value.requestId,createdAt:value.createdAt}
}
export async function pendingAttendanceInstallation(scope:string) {
  const ctx=await context(scope),pending=await read(ctx.storageKey); ctx.guard(); return pending
}
/** One installation/account envelope survives offline, remount and unknown replies. */
export async function beginAttendanceInstallation(scope:string) {
  const ctx=await context(scope)
  return mutate(async()=>{ ctx.guard(); const pending=await read(ctx.storageKey); ctx.guard(); if(pending)return pending
    const next={requestId:attendanceUuid(),createdAt:new Date().toISOString()}
    await AsyncStorage.setItem(ctx.storageKey,JSON.stringify(next));ctx.guard();return next
  })
}
export async function readAttendanceInstallation(scope:string) {
  const ctx=await context(scope),response=await api.getAttendanceInstallation(ctx.guard);ctx.guard()
  if(response?.success!==true)throw new Error('ATTENDANCE_INSTALLATION_INVALID')
  return parseAttendanceInstallation(response.data)
}
/** GET never acknowledges a POST. Even after it reports approval, retry this UUID. */
export async function sendAttendanceInstallation(scope:string,item:PendingAttendanceInstallation) {
  const ctx=await context(scope),pending=await read(ctx.storageKey);ctx.guard()
  if(!pending || pending.requestId!==item.requestId)throw new Error('ATTENDANCE_INSTALLATION_CHANGED')
  let response
  try { response=await api.requestAttendanceInstallation({requestId:pending.requestId},ctx.guard);ctx.guard() }
  catch(error) {
    ctx.guard()
    const refusal=error as {status?:number;code?:string;committed?:boolean}
    if(refusal.status!==409 || refusal.code!=='MTM_ATTENDANCE_INSTALLATION_ALREADY_REQUESTED' || refusal.committed!==false)throw error
    await mutate(async()=>{ctx.guard();const current=await read(ctx.storageKey);ctx.guard();if(current?.requestId===pending.requestId)await AsyncStorage.removeItem(ctx.storageKey);ctx.guard()})
    return null
  }
  if(response?.success!==true)throw new Error('ATTENDANCE_INSTALLATION_INVALID')
  const receipt=parseAttendanceInstallation(response.data)
  if(receipt.requestId!==pending.requestId)throw new Error('ATTENDANCE_INSTALLATION_CHANGED')
  await mutate(async()=>{ctx.guard();const current=await read(ctx.storageKey);ctx.guard();if(current?.requestId===pending.requestId)await AsyncStorage.removeItem(ctx.storageKey);ctx.guard()})
  return receipt
}
export async function requireApprovedAttendanceInstallation(scope:string) {
  const own=await readAttendanceInstallation(scope)
  if(own.required && own.state!=='APPROVED')throw new Error('MTM_ATTENDANCE_INSTALLATION_APPROVAL_REQUIRED')
}
