jest.mock('@react-native-async-storage/async-storage',()=>require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('../../src/store/auth',()=>({useAuthStore:{getState:jest.fn()}}))
jest.mock('../../src/store/bootstrap',()=>({useBootstrapStore:{getState:jest.fn()}}))
jest.mock('../../src/services/attendance-location',()=>({attendanceMarkAvailable:jest.fn(()=>true),guardAttendanceMark:jest.fn()}))
import AsyncStorage from '@react-native-async-storage/async-storage'
import {useAuthStore} from '../../src/store/auth'
import {useBootstrapStore} from '../../src/store/bootstrap'
import {setOfflineScope} from '../../src/services/offline-scope'
import {attendanceMarkAvailable,guardAttendanceMark} from '../../src/services/attendance-location'
import {attendanceQrAvailable,newAttendanceQr,rememberAttendanceQrReceipts,readAttendanceQrReceipts} from '../../src/services/attendance-qr'
import {parseAttendanceQrReceipt} from '../../src/services/attendance-qr-contract'
import type {OutboxOperation,OutboxPushResult} from '../../src/services/outbox'
const scope='org-qr:agent-qr',token='fictional-secret-scanned-code'
const mark:OutboxOperation={operationId:'op-qr',scopeKey:scope,entity:'workdays',op:'create',data:{action:'START',id:'wd-qr',occurredAt:'2026-10-13T08:00:00Z',attendanceQr:{version:1,token}},clientTimestamp:1,status:'pending',attempts:0,nextAttemptAt:0}
const receipt={eventId:'event-qr',state:'VERIFIED',branch:{id:'branch-qr',name:'Fictional branch'}}
const result:OutboxPushResult={operationId:mark.operationId,status:'ok',serverData:{attendanceQr:receipt}}
let data:{policies:{attendanceBranchQrVersion?:number;agentPermissions:{attendanceBranchQr?:boolean}}}
beforeEach(async()=>{
 jest.clearAllMocks();await AsyncStorage.clear();setOfflineScope('org-qr','agent-qr')
 data={policies:{attendanceBranchQrVersion:1,agentPermissions:{attendanceBranchQr:true}}}
 ;(useBootstrapStore.getState as jest.Mock).mockImplementation(()=>({data}))
 ;(useAuthStore.getState as jest.Mock).mockReturnValue({isLoggedIn:true,agent:{id:'agent-qr',organizationId:'org-qr'}})
 ;(attendanceMarkAvailable as jest.Mock).mockReturnValue(true)
})
it('requires an exact version and permission without starting location collection',()=>{
 expect(newAttendanceQr(scope,token)).toEqual({version:1,token});expect(newAttendanceQr(scope)).toEqual({version:1,token:null})
 data.policies.attendanceBranchQrVersion=2;expect(attendanceQrAvailable()).toBe(false);expect(newAttendanceQr(scope)).toBeUndefined();expect(()=>newAttendanceQr(scope,token)).toThrow('ATTENDANCE_QR_UNAVAILABLE')
 data.policies.attendanceBranchQrVersion=1;delete data.policies.agentPermissions.attendanceBranchQr;expect(attendanceQrAvailable()).toBe(false)
})
it('keeps a safe canonical receipt across reload and exact replay after the rule is off',async()=>{
 await rememberAttendanceQrReceipts(scope,[mark],[result]);data.policies.agentPermissions.attendanceBranchQr=false
 await rememberAttendanceQrReceipts(scope,[mark],[result]);const stored=await readAttendanceQrReceipts(scope,'wd-qr')
 expect(stored).toEqual([{...receipt,operationId:'op-qr',workdayId:'wd-qr',action:'START',occurredAt:mark.data.occurredAt}])
 expect(JSON.stringify((AsyncStorage.setItem as jest.Mock).mock.calls)).not.toContain(token)
 expect(await readAttendanceQrReceipts(scope,'different-day')).toEqual([])
})
it('does not turn absence or an old invalid receipt into verified presence',async()=>{
 await rememberAttendanceQrReceipts(scope,[mark],[{...result,serverData:{attendanceQr:{eventId:'event-qr',state:'EXPIRED',branch:null}}}])
 await rememberAttendanceQrReceipts(scope,[mark],[{...result,serverData:{}}])
 expect((await readAttendanceQrReceipts(scope,'wd-qr'))[0].state).toBe('EXPIRED')
 await expect(rememberAttendanceQrReceipts(scope,[mark],[result])).rejects.toThrow('ATTENDANCE_QR_RECEIPT_CHANGED')
})
it('fails before ACK on storage failure or an unbound response',async()=>{
 ;(AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk'))
 await expect(rememberAttendanceQrReceipts(scope,[mark],[result])).rejects.toThrow('disk')
 await expect(rememberAttendanceQrReceipts(scope,[mark],[{...result,operationId:'other'}])).rejects.toThrow('ATTENDANCE_QR_RECEIPT_UNBOUND')
 expect(await readAttendanceQrReceipts(scope,'wd-qr')).toEqual([])
})
it('rejects a late response when the account changed during storage',async()=>{
 ;(AsyncStorage.getItem as jest.Mock).mockImplementationOnce(async()=>{setOfflineScope('org-other','agent-other');return null})
 await expect(rememberAttendanceQrReceipts(scope,[mark],[result])).rejects.toThrow('ATTENDANCE_SCOPE_CHANGED')
 expect(AsyncStorage.setItem).not.toHaveBeenCalled()
})
it('ignores noncanonical/conflict data and guards receipt reads',async()=>{
 await rememberAttendanceQrReceipts(scope,[mark],[{...result,status:'conflict'}]);expect(AsyncStorage.setItem).not.toHaveBeenCalled()
 ;(guardAttendanceMark as jest.Mock).mockImplementationOnce(()=>{throw new Error('withdrawn')})
 await expect(readAttendanceQrReceipts(scope,'wd-qr')).rejects.toThrow('withdrawn')
})
it.each([{...receipt,branch:null},{...receipt,state:'EXPIRED'},{...receipt,state:'GPS_INSIDE'},{...receipt,eventId:''}])('rejects malformed receipt %#',input=>expect(()=>parseAttendanceQrReceipt(input)).toThrow('ATTENDANCE_QR_RECEIPT_INVALID'))
