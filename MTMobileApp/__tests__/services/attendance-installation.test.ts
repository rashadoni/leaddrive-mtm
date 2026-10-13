import AsyncStorage from '@react-native-async-storage/async-storage'
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))
jest.mock('../../src/services/api', () => ({api:{getAttendanceInstallation:jest.fn(),requestAttendanceInstallation:jest.fn()}}))
jest.mock('../../src/services/field-device-id', () => ({getFieldDeviceId:jest.fn().mockResolvedValue('rf-fictional-installation')}))
jest.mock('../../src/store/auth', () => ({useAuthStore:{getState:jest.fn()}}))
jest.mock('../../src/store/bootstrap', () => ({useBootstrapStore:{getState:jest.fn()}}))
import { api } from '../../src/services/api'
import { getFieldDeviceId } from '../../src/services/field-device-id'
import { useAuthStore } from '../../src/store/auth'
import { useBootstrapStore } from '../../src/store/bootstrap'
import { setOfflineScope } from '../../src/services/offline-scope'
import { officeAgent,officeBootstrap } from '../../test-support/office-attendance'
import { attendanceInstallationAvailable,beginAttendanceInstallation,pendingAttendanceInstallation,readAttendanceInstallation,sendAttendanceInstallation,requireApprovedAttendanceInstallation } from '../../src/services/attendance-installation'
import { parseAttendanceInstallation,type AttendanceInstallation } from '../../src/services/attendance-installation-contract'
const scope='org-fixture:office-fixture',uuid='347bf275-448b-4e8f-b018-ad3571bb7b94',other='d337f0d8-ad42-4680-a381-d583366b5cbb'
const own:AttendanceInstallation={required:true,installationLabel:'Fictional installation',state:'NOT_REQUESTED',requestId:null,submittedAt:null,decision:null,revocation:null,canRequest:true}
const pending=(requestId=uuid):AttendanceInstallation=>({...own,state:'PENDING',requestId,submittedAt:'2026-10-13T08:00:00Z',canRequest:false})
let data=officeBootstrap()
beforeEach(async()=>{
  jest.clearAllMocks();await AsyncStorage.clear();setOfflineScope(officeAgent.organizationId,officeAgent.id)
  data=officeBootstrap();data.policies.attendanceMarkVersion=1;data.policies.agentPermissions!.attendanceInstallation=true
  ;(useAuthStore.getState as jest.Mock).mockReturnValue({isLoggedIn:true,agent:officeAgent})
  ;(useBootstrapStore.getState as jest.Mock).mockImplementation(()=>({data,routeFieldAccess:'unavailable'}))
  ;(getFieldDeviceId as jest.Mock).mockResolvedValue('rf-fictional-installation')
  ;(api.getAttendanceInstallation as jest.Mock).mockResolvedValue({success:true,data:own})
  ;(api.requestAttendanceInstallation as jest.Mock).mockImplementation(async input=>({success:true,data:pending(input.requestId)}))
})
it('requires the exact permission and current account',async()=>{
  expect(attendanceInstallationAvailable()).toBe(true);data.policies.agentPermissions!.attendanceInstallation=false
  await expect(beginAttendanceInstallation(scope)).rejects.toMatchObject({status:403});expect(api.requestAttendanceInstallation).not.toHaveBeenCalled()
})
it('persists one UUID for concurrent starts and offline retries',async()=>{
  const [first,second]=await Promise.all([beginAttendanceInstallation(scope),beginAttendanceInstallation(scope)])
  expect(first).toEqual(second);expect(first.requestId).toMatch(/^[a-f0-9-]{36}$/)
  ;(api.requestAttendanceInstallation as jest.Mock).mockRejectedValueOnce(new Error('lost reply'))
  await expect(sendAttendanceInstallation(scope,first)).rejects.toThrow('lost reply');expect(await pendingAttendanceInstallation(scope)).toEqual(first)
  // A current GET does not ACK the original POST or allocate another UUID.
  ;(api.getAttendanceInstallation as jest.Mock).mockResolvedValue({success:true,data:{...pending(first.requestId),state:'APPROVED',decision:{action:'APPROVE',at:'2026-10-13T08:01:00Z',reason:'Fictional approval'}}})
  await readAttendanceInstallation(scope);expect(await beginAttendanceInstallation(scope)).toEqual(first)
  await sendAttendanceInstallation(scope,first);expect(await pendingAttendanceInstallation(scope)).toBeNull()
  expect((api.requestAttendanceInstallation as jest.Mock).mock.calls.map(call=>call[0])).toEqual([{requestId:first.requestId},{requestId:first.requestId}])
})
it('isolates pending envelopes by installation as well as account',async()=>{
  const first=await beginAttendanceInstallation(scope)
  ;(getFieldDeviceId as jest.Mock).mockResolvedValue('rf-other-installation')
  expect(await pendingAttendanceInstallation(scope)).toBeNull();await expect(sendAttendanceInstallation(scope,first)).rejects.toThrow('ATTENDANCE_INSTALLATION_CHANGED')
  setOfflineScope('other-org','other-user');await expect(pendingAttendanceInstallation(scope)).rejects.toThrow('ATTENDANCE_SCOPE_CHANGED')
})
it('keeps a pending request if the receipt names another UUID or permission changes during POST',async()=>{
  const first=await beginAttendanceInstallation(scope)
  ;(api.requestAttendanceInstallation as jest.Mock).mockResolvedValueOnce({success:true,data:pending(other)})
  await expect(sendAttendanceInstallation(scope,first)).rejects.toThrow('ATTENDANCE_INSTALLATION_CHANGED')
  ;(api.requestAttendanceInstallation as jest.Mock).mockImplementationOnce(async()=>{data.policies.agentPermissions!.attendanceInstallation=false;return {success:true,data:pending(first.requestId)}})
  await expect(sendAttendanceInstallation(scope,first)).rejects.toMatchObject({status:403});data.policies.agentPermissions!.attendanceInstallation=true
  expect(await pendingAttendanceInstallation(scope)).toEqual(first)
})
it.each([undefined,true,'false'])('does not release a UUID without an exact uncommitted refusal (%s)',async committed=>{
  const first=await beginAttendanceInstallation(scope)
  ;(api.requestAttendanceInstallation as jest.Mock).mockRejectedValueOnce({status:409,code:'MTM_ATTENDANCE_INSTALLATION_ALREADY_REQUESTED',committed})
  await expect(sendAttendanceInstallation(scope,first)).rejects.toBeDefined();expect(await pendingAttendanceInstallation(scope)).toEqual(first)
})
it('releases only a definitely uncommitted duplicate, never an idempotency mismatch',async()=>{
  const first=await beginAttendanceInstallation(scope)
  ;(api.requestAttendanceInstallation as jest.Mock).mockRejectedValueOnce({status:409,code:'MTM_ATTENDANCE_INSTALLATION_IDEMPOTENCY_MISMATCH',committed:false})
  await expect(sendAttendanceInstallation(scope,first)).rejects.toBeDefined();expect(await pendingAttendanceInstallation(scope)).toEqual(first)
  ;(api.requestAttendanceInstallation as jest.Mock).mockRejectedValueOnce({status:409,code:'MTM_ATTENDANCE_INSTALLATION_ALREADY_REQUESTED',committed:false})
  expect(await sendAttendanceInstallation(scope,first)).toBeNull();expect(await pendingAttendanceInstallation(scope)).toBeNull()
})
it('never posts before the pending envelope is durably stored',async()=>{
  ;(AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk'))
  await expect(beginAttendanceInstallation(scope)).rejects.toThrow('disk');expect(api.requestAttendanceInstallation).not.toHaveBeenCalled()
})
it('requires fresh approval for a rejected mark but lets a disabled rule through',async()=>{
  await expect(requireApprovedAttendanceInstallation(scope)).rejects.toThrow('MTM_ATTENDANCE_INSTALLATION_APPROVAL_REQUIRED')
  ;(api.getAttendanceInstallation as jest.Mock).mockResolvedValue({success:true,data:{...own,required:false}})
  await expect(requireApprovedAttendanceInstallation(scope)).resolves.toBeUndefined()
})
it.each([{...own,required:'true'},{...pending(),state:'APPROVED'},{...pending(),requestId:'bad'},{...pending(),state:'REJECTED',decision:{action:'REJECT',at:'bad',reason:'No'}}])('rejects malformed approval state',value=>expect(()=>parseAttendanceInstallation(value)).toThrow('ATTENDANCE_INSTALLATION_INVALID'))
