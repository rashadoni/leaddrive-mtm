import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import i18next from 'i18next'
import { I18nextProvider } from 'react-i18next'
import ru from '../../src/i18n/locales/ru.json'
import az from '../../src/i18n/locales/az.json'
import en from '../../src/i18n/locales/en.json'
import { officeAgent, officeBootstrap } from '../../test-support/office-attendance'
import type { OwnAttendanceLocation } from '../../src/services/attendance-location-contract'
import type { OutboxOperation } from '../../src/services/outbox'
const mockBootstrap = { data: officeBootstrap() }
jest.mock('../../src/store/auth', () => ({ useAuthStore: (select: (state: unknown) => unknown) => select({ agent: officeAgent }) }))
jest.mock('../../src/store/bootstrap', () => ({ useBootstrapStore: (select: (state: unknown) => unknown) => select(mockBootstrap) }))
jest.mock('../../src/services/attendance-location', () => ({ attendanceLocationScope: jest.fn(() => 'org-fixture:office-fixture'), readAttendanceLocation: jest.fn(), pendingAttendanceConsent: jest.fn(), beginAttendanceConsent: jest.fn(), sendAttendanceConsent: jest.fn() }))
import AttendanceLocationConsentCard from '../../src/components/AttendanceLocationConsentCard'
import { attendanceLocationScope, readAttendanceLocation, pendingAttendanceConsent, beginAttendanceConsent, sendAttendanceConsent } from '../../src/services/attendance-location'
const accepted: OwnAttendanceLocation = { policy: { id: 'fictional-policy', version: 1, enabled: true, legalReviewConfirmed: true, createdAt: '2026-10-13T00:00:00Z', texts: { ru: 'Вымышленный текст только для теста интерфейса; не юридическое согласие.', az: 'Yalnız interfeys testi üçün uydurma mətn; hüquqi razılıq deyil.', en: 'Fictional text for UI testing only; not legal consent.' } }, consent: { id: 'fictional-receipt', policyRevisionId: 'fictional-policy', accepted: true, createdAt: '2026-10-13T01:00:00Z' }, maySendLocation: true }
let own: OwnAttendanceLocation, pending: OutboxOperation | null
const locale = i18next.createInstance(), roots: TestRenderer.ReactTestRenderer[] = []
const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) }) }
async function render(language = 'ru') {
  await locale.changeLanguage(language)
  let tree!: TestRenderer.ReactTestRenderer
  await act(async () => { tree = TestRenderer.create(<I18nextProvider i18n={locale}><AttendanceLocationConsentCard /></I18nextProvider>) })
  roots.push(tree); await settle(); return tree
}
const node = (tree: TestRenderer.ReactTestRenderer, id: string) => tree.root.findAll(item => item.props.testID === id, { deep: false })[0]
async function press(tree: TestRenderer.ReactTestRenderer, id: string) { await act(async () => { node(tree,id).props.onPress() }); await settle() }
function host(value: TestRenderer.ReactTestRendererJSON | TestRenderer.ReactTestRendererJSON[] | string | null): unknown {
  if (value === null || typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(host)
  return { type: value.type, props: Object.fromEntries(Object.entries(value.props).filter(([key]) => ['style','testID','disabled','value','accessibilityRole','accessibilityLabel'].includes(key))), children: value.children?.map(host) ?? null }
}
const text = (tree: TestRenderer.ReactTestRenderer) => JSON.stringify(host(tree.toJSON()))
function capture(tree: TestRenderer.ReactTestRenderer, name: string) {
  const directory = process.env.MTM_ATTENDANCE_RENDER_DIR
  if (!directory) return
  mkdirSync(directory, { recursive: true }); writeFileSync(join(directory, `${name}.json`), JSON.stringify(host(tree.toJSON()), null, 2))
}
beforeAll(async () => { await locale.init({lng:'ru',fallbackLng:'ru',resources:{ru:{translation:ru},az:{translation:az},en:{translation:en}},interpolation:{escapeValue:false}}) })
beforeEach(() => {
  jest.clearAllMocks(); mockBootstrap.data = officeBootstrap(); mockBootstrap.data.policies.attendanceMarkVersion = 1; mockBootstrap.data.policies.agentPermissions!.attendanceLocation = true
  own = { policy: null, consent: null, maySendLocation: false }; pending = null
  ;(attendanceLocationScope as jest.Mock).mockReturnValue('org-fixture:office-fixture')
  ;(readAttendanceLocation as jest.Mock).mockImplementation(async () => own)
  ;(pendingAttendanceConsent as jest.Mock).mockImplementation(async () => pending)
  ;(beginAttendanceConsent as jest.Mock).mockImplementation(async (_scope, state, acceptedValue) => {
    pending = {operationId:'fixed-uuid',entity:'attendanceConsents',op:'create',data:{requestId:'fixed-uuid',accepted:acceptedValue,policyRevisionId:state.policy.id,expectedConsentId:state.consent?.id ?? null},clientTimestamp:1,attempts:0,nextAttemptAt:0,scopeKey:'org-fixture:office-fixture',status:'pending'}
    return pending
  })
  ;(sendAttendanceConsent as jest.Mock).mockImplementation(async (_scope,item) => { own = {...accepted,consent:{...accepted.consent!,accepted:item.data.accepted},maySendLocation:item.data.accepted}; pending=null })
})
afterEach(async () => { await act(async () => roots.splice(0).forEach(root => root.unmount())) })
it.each(['ru','az','en'])('renders actual %s default-off and fictional consent states without default acceptance', async language => {
  const tree = await render(language), copy = {ru,az,en}[language as 'ru'|'az'|'en'].attendanceLocation
  expect(text(tree)).toContain(copy.noText); expect(node(tree,'attendance-consent-accept')).toBeUndefined(); capture(tree,`location-off-${language}`)
  own={...accepted,consent:null,maySendLocation:false}; await press(tree,'attendance-consent-refresh'); await press(tree,'attendance-consent-disclosure')
  expect(text(tree)).toContain(accepted.policy!.texts[language as 'ru'|'az'|'en'])
  expect(node(tree,'attendance-consent-check').props.value).toBe(false); expect(node(tree,'attendance-consent-accept').props.disabled).toBe(true)
  expect(text(tree)).not.toContain('attendanceLocation.'); capture(tree,`location-consent-${language}`)
})
it('requires explicit consent and leaves the editor usable after the confirmed follow-up read', async () => {
  own={...accepted,consent:null,maySendLocation:false}; const tree=await render(); await press(tree,'attendance-consent-disclosure')
  await press(tree,'attendance-consent-accept'); expect(beginAttendanceConsent).not.toHaveBeenCalled()
  await act(async () => node(tree,'attendance-consent-check').props.onValueChange(true)); await press(tree,'attendance-consent-accept')
  expect(beginAttendanceConsent).toHaveBeenCalledWith('org-fixture:office-fixture', expect.objectContaining({consent:null}),true)
  expect(node(tree,'attendance-consent-refresh').props.disabled).toBe(false); expect(node(tree,'attendance-consent-revoke')).toBeDefined()
})
it('withdraws immediately, locks on unknown reply, remounts and retries the immutable saved record', async () => {
  own=accepted; (sendAttendanceConsent as jest.Mock).mockRejectedValueOnce(new Error('lost reply'))
  const tree=await render(); await press(tree,'attendance-consent-revoke')
  expect(beginAttendanceConsent).toHaveBeenCalledWith('org-fixture:office-fixture',accepted,false)
  const original=pending; expect(node(tree,'attendance-consent-pending')).toBeDefined()
  await act(async () => tree.unmount()); const next=await render('az'); await press(next,'attendance-consent-retry')
  expect(beginAttendanceConsent).toHaveBeenCalledTimes(1); expect(sendAttendanceConsent).toHaveBeenLastCalledWith('org-fixture:office-fixture',original)
})
it('does not duplicate an inflight decision when changing language', async () => {
  own=accepted; let finish!:()=>void; (sendAttendanceConsent as jest.Mock).mockImplementationOnce(()=>new Promise<void>(done=>{finish=done}))
  const tree=await render(); await press(tree,'attendance-consent-revoke'); await act(async()=>locale.changeLanguage('en'))
  expect(node(tree,'attendance-consent-retry').props.disabled).toBe(true); await press(tree,'attendance-consent-retry'); expect(sendAttendanceConsent).toHaveBeenCalledTimes(1)
  await act(async()=>finish()); await settle(); expect(node(tree,'attendance-consent-refresh').props.disabled).toBe(false)
})
it.each([401,403,404])('clears text and decisions after access is refused with %s',async status=>{
  own=accepted; const tree=await render(); await press(tree,'attendance-consent-disclosure'); (readAttendanceLocation as jest.Mock).mockRejectedValueOnce({status})
  await press(tree,'attendance-consent-refresh'); expect(text(tree)).not.toContain(accepted.policy!.texts.ru); expect(node(tree,'attendance-consent-revoke')).toBeUndefined(); expect(node(tree,'attendance-location-denied')).toBeDefined()
})
it('shows no controls and makes no API request for missing explicit opt-in',async()=>{
  mockBootstrap.data.policies.attendanceMarkVersion=undefined; const tree=await render(); expect(tree.toJSON()).toBeNull(); expect(readAttendanceLocation).not.toHaveBeenCalled()
})
it('does not publish after leaving while the durable write is still completing',async()=>{
  own=accepted; let finish!:(item:OutboxOperation)=>void; (beginAttendanceConsent as jest.Mock).mockImplementationOnce(()=>new Promise<OutboxOperation>(done=>{finish=done}))
  const tree=await render(); await press(tree,'attendance-consent-revoke'); await act(async()=>tree.unmount()); await act(async()=>finish({entity:'attendanceConsents'} as OutboxOperation))
  expect(sendAttendanceConsent).not.toHaveBeenCalled()
})
