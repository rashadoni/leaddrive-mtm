import React from 'react'
import TestRenderer,{act} from 'react-test-renderer'
import {AppState} from 'react-native'
import i18next from 'i18next'
import {I18nextProvider} from 'react-i18next'
import {mkdirSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import ru from '../../src/i18n/locales/ru.json'
import az from '../../src/i18n/locales/az.json'
import en from '../../src/i18n/locales/en.json'
const mockPermission={hasPermission:true,requestPermission:jest.fn().mockResolvedValue(true)}
let mockScan!:(codes:Array<{type:string;value?:string}>)=>void
jest.mock('react-native-vision-camera',()=>({Camera:'Camera',useCameraDevice:()=>({id:'fictional-camera'}),useCameraPermission:()=>mockPermission,useCodeScanner:(value:{onCodeScanned:typeof mockScan})=>{mockScan=value.onCodeScanned;return value}}))
jest.mock('react-native-safe-area-context',()=>({SafeAreaProvider:({children}: {children:unknown})=>children,useSafeAreaInsets:()=>({top:0,bottom:0,left:0,right:0})}))
jest.mock('../../src/services/attendance-qr',()=>({guardAttendanceQr:jest.fn()}))
import AttendanceQrScanner from '../../src/components/AttendanceQrScanner'
import {guardAttendanceQr} from '../../src/services/attendance-qr'
const locale=i18next.createInstance(),roots:TestRenderer.ReactTestRenderer[]=[]
const close=jest.fn(),confirm=jest.fn(),raw='fictional-sensitive-qr-token'
let background!:(state:'active'|'background')=>void
const node=(tree:TestRenderer.ReactTestRenderer,id:string)=>tree.root.findAll(item=>item.props.testID===id,{deep:false})[0]
const settle=async()=>{await act(async()=>{await new Promise(done=>setTimeout(done,0))})}
async function render(language='ru'){await locale.changeLanguage(language);let tree!:TestRenderer.ReactTestRenderer;await act(async()=>{tree=TestRenderer.create(<I18nextProvider i18n={locale}><AttendanceQrScanner visible scope="org:agent" action="START" onClose={close} onConfirm={confirm}/></I18nextProvider>)});roots.push(tree);return tree}
function host(value:TestRenderer.ReactTestRendererJSON|TestRenderer.ReactTestRendererJSON[]|string|null):unknown{
 if(value===null||typeof value==='string')return value
 if(Array.isArray(value))return value.map(host)
 return {type:value.type,props:Object.fromEntries(Object.entries(value.props).filter(([key])=>['style','contentContainerStyle','testID','accessibilityRole','disabled','isActive'].includes(key))),children:value.children?.map(host)??null}
}
function capture(tree:TestRenderer.ReactTestRenderer,name:string){const dir=process.env.MTM_ATTENDANCE_RENDER_DIR;if(dir){mkdirSync(dir,{recursive:true});writeFileSync(join(dir,name+'.json'),JSON.stringify(host(tree.toJSON()),null,2))}}
beforeAll(async()=>{await locale.init({lng:'ru',fallbackLng:'ru',resources:{ru:{translation:ru},az:{translation:az},en:{translation:en}},interpolation:{escapeValue:false}})})
beforeEach(()=>{jest.clearAllMocks();(guardAttendanceQr as jest.Mock).mockReset();confirm.mockResolvedValue(undefined);mockPermission.hasPermission=true;AppState.currentState='active';jest.spyOn(AppState,'addEventListener').mockImplementation((_event,listener)=>{background=listener;return {remove:jest.fn()}})})
afterEach(async()=>{await act(async()=>roots.splice(0).forEach(root=>root.unmount()));jest.restoreAllMocks()})
it.each(['ru','az','en'])('requires explicit %s confirmation and never renders or records the raw QR',async language=>{
 const tree=await render(language),camera=node(tree,'attendance-qr-camera')
 expect(camera.props.photo).toBeUndefined();expect(camera.props.video).toBeUndefined();expect(camera.props.isActive).toBe(true);capture(tree,`qr-camera-${language}`)
 await act(async()=>mockScan([{type:'qr',value:raw}]));expect(confirm).not.toHaveBeenCalled();expect(node(tree,'attendance-qr-camera')).toBeUndefined()
 expect(JSON.stringify(host(tree.toJSON()))).not.toContain(raw);expect(JSON.stringify(host(tree.toJSON()))).toContain({ru,az,en}[language as 'ru'|'az'|'en'].attendanceQr.checkAtSend);capture(tree,`qr-confirm-${language}`)
 await act(async()=>node(tree,'attendance-qr-confirm').props.onPress());await settle();expect(confirm).toHaveBeenCalledWith(raw);expect(close).toHaveBeenCalledTimes(1)
})
it('cancel or denied camera does not create a mark',async()=>{
 mockPermission.hasPermission=false;const tree=await render();expect(node(tree,'attendance-qr-camera')).toBeUndefined()
 await act(async()=>node(tree,'attendance-qr-cancel').props.onPress());expect(confirm).not.toHaveBeenCalled()
})
it('ignores invalid, duplicate and late background scans',async()=>{
 const tree=await render();await act(async()=>mockScan([{type:'qr',value:'x'.repeat(4097)}]));expect(node(tree,'attendance-qr-confirm')).toBeUndefined()
 await act(async()=>mockScan([{type:'qr',value:raw}]));await act(async()=>mockScan([{type:'qr',value:'different'}]))
 await act(async()=>{AppState.currentState='background';background('background')});expect(close).toHaveBeenCalled()
 await act(async()=>mockScan([{type:'qr',value:raw}]));expect(confirm).not.toHaveBeenCalled()
})
it('prevents duplicate confirmations and ignores an old account callback',async()=>{
 let finish!:()=>void;confirm.mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve}))
 const tree=await render();await act(async()=>mockScan([{type:'qr',value:raw}]))
 await act(async()=>{node(tree,'attendance-qr-confirm').props.onPress();node(tree,'attendance-qr-confirm').props.onPress()});expect(confirm).toHaveBeenCalledTimes(1)
 await act(async()=>tree.unmount());await act(async()=>finish());expect(close).not.toHaveBeenCalled()
 const other=await render();(guardAttendanceQr as jest.Mock).mockImplementation(()=>{throw new Error('scope changed')})
 await act(async()=>mockScan([{type:'qr',value:raw}]));expect(node(other,'attendance-qr-confirm')).toBeUndefined()
})

it('does not mount a camera after attendance admission is lost',async()=>{
 (guardAttendanceQr as jest.Mock).mockImplementation(()=>{throw new Error('revoked')})
 const tree=await render()
 expect(node(tree,'attendance-qr-camera')).toBeUndefined()
 expect(confirm).not.toHaveBeenCalled()
})
