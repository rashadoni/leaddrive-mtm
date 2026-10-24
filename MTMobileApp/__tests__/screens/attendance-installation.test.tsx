jest.mock("react-native-vector-icons/Ionicons", () => "Icon")
import React from 'react'
import TestRenderer,{act} from 'react-test-renderer'
import {mkdirSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import i18next from 'i18next'
import {I18nextProvider} from 'react-i18next'
import ru from '../../src/i18n/locales/ru.json'
import az from '../../src/i18n/locales/az.json'
import en from '../../src/i18n/locales/en.json'
import {officeAgent,officeBootstrap} from '../../test-support/office-attendance'
import type {AttendanceInstallation,PendingAttendanceInstallation} from '../../src/services/attendance-installation-contract'
const mockAuth={agent:officeAgent},mockBootstrap={data:officeBootstrap()}
jest.mock('../../src/store/auth',()=>({useAuthStore:(select:(state:unknown)=>unknown)=>select(mockAuth)}))
jest.mock('../../src/store/bootstrap',()=>({useBootstrapStore:(select:(state:unknown)=>unknown)=>select(mockBootstrap)}))
jest.mock('../../src/store/workday',()=>({workdayKey:(org:string,id:string)=>`${org}:${id}`}))
jest.mock('../../src/services/attendance-installation',()=>({attendanceInstallationScope:jest.fn(),beginAttendanceInstallation:jest.fn(),pendingAttendanceInstallation:jest.fn(),readAttendanceInstallation:jest.fn(),sendAttendanceInstallation:jest.fn()}))
import {attendanceInstallationScope,beginAttendanceInstallation,pendingAttendanceInstallation,readAttendanceInstallation,sendAttendanceInstallation} from '../../src/services/attendance-installation'
import {useAttendanceInstallation} from '../../src/hooks/useAttendanceInstallation'
import AttendanceInstallationCard from '../../src/components/AttendanceInstallationCard'
const locale=i18next.createInstance(),roots:TestRenderer.ReactTestRenderer[]=[]
const scope='org-fixture:office-fixture',uuid='347bf275-448b-4e8f-b018-ad3571bb7b94',at='2026-10-13T08:00:00Z'
let own:AttendanceInstallation,pending:PendingAttendanceInstallation|null,current!:ReturnType<typeof useAttendanceInstallation>
function Screen({compact=false}:{compact?:boolean}){current=useAttendanceInstallation();return <AttendanceInstallationCard compact={compact} installation={current}/>}
const node=(tree:TestRenderer.ReactTestRenderer,id:string)=>tree.root.findAll(item=>item.props.testID===id,{deep:false})[0]
const settle=async()=>{await act(async()=>{await new Promise(done=>setTimeout(done,0))})}
async function render(language='ru',compact=false){await locale.changeLanguage(language);let tree!:TestRenderer.ReactTestRenderer;await act(async()=>{tree=TestRenderer.create(<I18nextProvider i18n={locale}><Screen compact={compact}/></I18nextProvider>)});roots.push(tree);await settle();return tree}
async function press(tree:TestRenderer.ReactTestRenderer,id:string){await act(async()=>{node(tree,id).props.onPress()});await settle()}
function host(value:TestRenderer.ReactTestRendererJSON|TestRenderer.ReactTestRendererJSON[]|string|null):unknown{
  if(value===null||typeof value==='string')return value
  if(Array.isArray(value))return value.map(host)
  return {type:value.type,props:Object.fromEntries(Object.entries(value.props).filter(([key])=>['style','testID','disabled','accessibilityRole'].includes(key))),children:value.children?.map(host)??null}
}
const text=(tree:TestRenderer.ReactTestRenderer)=>JSON.stringify(host(tree.toJSON()))
function capture(tree:TestRenderer.ReactTestRenderer,name:string){const dir=process.env.MTM_ATTENDANCE_RENDER_DIR;if(dir){mkdirSync(dir,{recursive:true});writeFileSync(join(dir,name+'.json'),JSON.stringify(host(tree.toJSON()),null,2))}}
beforeAll(async()=>{await locale.init({lng:'ru',fallbackLng:'ru',resources:{ru:{translation:ru},az:{translation:az},en:{translation:en}},interpolation:{escapeValue:false}})})
beforeEach(()=>{
  jest.clearAllMocks();mockAuth.agent={...officeAgent};mockBootstrap.data=officeBootstrap();mockBootstrap.data.policies.attendanceMarkVersion=1;mockBootstrap.data.policies.agentPermissions!.attendanceInstallation=true
  own={required:true,installationLabel:'Fictional installation',state:'NOT_REQUESTED',requestId:null,submittedAt:null,decision:null,revocation:null,canRequest:true};pending=null
  ;(attendanceInstallationScope as jest.Mock).mockReturnValue(scope)
  ;(pendingAttendanceInstallation as jest.Mock).mockImplementation(async()=>pending)
  ;(readAttendanceInstallation as jest.Mock).mockImplementation(async()=>own)
  ;(beginAttendanceInstallation as jest.Mock).mockImplementation(async()=>{pending={requestId:uuid,createdAt:at};return pending})
  ;(sendAttendanceInstallation as jest.Mock).mockImplementation(async()=>{own={...own,state:'PENDING',requestId:uuid,submittedAt:at,canRequest:false};pending=null;return own})
})
afterEach(async()=>{await act(async()=>{roots.splice(0).forEach(root=>root.unmount())})})
it.each(['ru','az','en'])('renders actual %s request and awaiting states without asking for GPS',async language=>{
  const tree=await render(language),copy={ru,az,en}[language as 'ru'|'az'|'en'].attendanceInstallation
  expect(text(tree)).toContain(copy.nextStep.NOT_REQUESTED)
  expect(text(tree)).toContain(copy.noLocation);expect(current.blocked).toBe(true);capture(tree,`installation-request-${language}`)
  await press(tree,'attendance-installation-request');expect(sendAttendanceInstallation).toHaveBeenCalledWith(scope,{requestId:uuid,createdAt:at});expect(node(tree,'attendance-installation-request')).toBeUndefined()
  expect(text(tree)).toContain(copy.PENDING);expect(text(tree)).not.toContain('attendanceInstallation.');capture(tree,`installation-pending-${language}`)
  expect(text(tree)).toContain(copy.nextStep.PENDING)
})
it.each(['APPROVED','REJECTED','REVOKED'] as const)('shows current %s decision and blocks only unapproved marks',async state=>{
  own={...own,state,requestId:uuid,submittedAt:at,decision:{action:state==='REJECTED'?'REJECT':'APPROVE',at,reason:'Fictional manager reason'},revocation:state==='REVOKED'?{at,reason:'Fictional revocation reason'}:null,canRequest:state!=='APPROVED'}
  const tree=await render();expect(current.blocked).toBe(state!=='APPROVED');expect(text(tree)).toContain(state==='REVOKED'?'Fictional revocation reason':'Fictional manager reason')
  expect(text(tree)).toContain(ru.attendanceInstallation.nextStep[state])
  expect(!!node(tree,'attendance-installation-request')).toBe(state!=='APPROVED')
})
it('does not turn an approved GET into acknowledgement of an unknown POST',async()=>{
  ;(sendAttendanceInstallation as jest.Mock).mockRejectedValueOnce(new Error('lost reply'))
  const tree=await render();await press(tree,'attendance-installation-request');expect(node(tree,'attendance-installation-pending')).toBeDefined()
  own={...own,state:'APPROVED',requestId:uuid,submittedAt:at,decision:{action:'APPROVE',at,reason:'Fictional approval'},canRequest:false}
  await press(tree,'attendance-installation-refresh');expect(node(tree,'attendance-installation-request')).toBeDefined()
  await press(tree,'attendance-installation-request');expect(beginAttendanceInstallation).toHaveBeenCalledTimes(1)
  expect((sendAttendanceInstallation as jest.Mock).mock.calls.map(call=>call[1])).toEqual([{requestId:uuid,createdAt:at},{requestId:uuid,createdAt:at}])
})
it('prevents duplicate taps and ignores a late response after unmount',async()=>{
  let finish!:(value:AttendanceInstallation)=>void;(sendAttendanceInstallation as jest.Mock).mockImplementationOnce(()=>new Promise<AttendanceInstallation>(done=>{finish=done}))
  const tree=await render();await act(async()=>{node(tree,'attendance-installation-request').props.onPress();node(tree,'attendance-installation-request').props.onPress()});await settle()
  expect(beginAttendanceInstallation).toHaveBeenCalledTimes(1);const reads=(readAttendanceInstallation as jest.Mock).mock.calls.length
  await act(async()=>tree.unmount());await act(async()=>finish(own));expect(readAttendanceInstallation).toHaveBeenCalledTimes(reads)
})
it.each([false,undefined])('hides disabled/missing own permission (%s)',async permission=>{
  if(permission===undefined)delete mockBootstrap.data.policies.agentPermissions!.attendanceInstallation
  else mockBootstrap.data.policies.agentPermissions!.attendanceInstallation=permission
  const tree=await render();expect(tree.toJSON()).toBeNull();expect(readAttendanceInstallation).not.toHaveBeenCalled()
})
it('does not show or block for an explicitly disabled company rule',async()=>{
  own={...own,required:false};const tree=await render();expect(tree.toJSON()).toBeNull();expect(current.blocked).toBe(false)
})
it.each([401,403,404])('clears decision text when current access is refused (%s)',async status=>{
  own={...own,state:'REJECTED',requestId:uuid,submittedAt:at,decision:{action:'REJECT',at,reason:'Fictional private reason'}}
  const tree=await render();(readAttendanceInstallation as jest.Mock).mockRejectedValueOnce({status})
  await press(tree,'attendance-installation-refresh');expect(text(tree)).not.toContain('Fictional private reason')
})

it('keeps approved compact details optional and immediately exposes revocation guidance', async () => {
  own={...own,state:'APPROVED',canRequest:false}
  const tree=await render('ru',true)
  expect(node(tree,'attendance-installation-disclosure').props.accessibilityState.expanded).toBe(false)
  expect(text(tree)).toContain(ru.attendanceInstallation.APPROVED)
  expect(node(tree,'attendance-installation-refresh')).toBeUndefined()
  await press(tree,'attendance-installation-disclosure')
  own={...own,state:'REVOKED',canRequest:true,revocation:{at,reason:'Fictional revoke reason'}}
  await press(tree,'attendance-installation-refresh')
  expect(current.blocked).toBe(true)
  expect(node(tree,'attendance-installation-request')).toBeDefined()
  expect(text(tree)).toContain('Fictional revoke reason')
  expect(text(tree)).toContain(ru.attendanceInstallation.nextStep.REVOKED)
})

it('serializes external refresh behind a durable device submission and keeps an ambiguous POST retryable', async () => {
  let reject!:(error:Error)=>void
  ;(sendAttendanceInstallation as jest.Mock).mockImplementationOnce(()=>new Promise((_done,fail)=>{reject=fail}))
  const tree=await render()
  await press(tree,'attendance-installation-request')
  expect(current.busy).toBe(true)
  const reads=(readAttendanceInstallation as jest.Mock).mock.calls.length
  await act(async()=>{await current.reload()})
  expect(readAttendanceInstallation).toHaveBeenCalledTimes(reads)
  await act(async()=>{reject(new Error('lost reply'))});await settle()
  expect(current.busy).toBe(false)
  expect(node(tree,'attendance-installation-pending')).toBeDefined()
  await press(tree,'attendance-installation-request')
  expect(beginAttendanceInstallation).toHaveBeenCalledTimes(1)
  expect(sendAttendanceInstallation).toHaveBeenCalledTimes(2)
  expect((sendAttendanceInstallation as jest.Mock).mock.calls.map(call=>call[1])).toEqual([{requestId:uuid,createdAt:at},{requestId:uuid,createdAt:at}])
  expect(current.busy).toBe(false)
})
