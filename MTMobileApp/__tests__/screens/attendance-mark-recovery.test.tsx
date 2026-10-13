import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import i18next from 'i18next'
import { I18nextProvider } from 'react-i18next'
import ru from '../../src/i18n/locales/ru.json'
import az from '../../src/i18n/locales/az.json'
import en from '../../src/i18n/locales/en.json'
import type { OutboxOperation } from '../../src/services/outbox'
const mockRetry = jest.fn()
jest.mock('../../src/store/workday', () => ({ useWorkdayStore: { getState: () => ({ retryAttendanceMark: mockRetry }) } }))
import AttendanceMarkRecoveryCard from '../../src/components/AttendanceMarkRecoveryCard'
const locale = i18next.createInstance(), roots: TestRenderer.ReactTestRenderer[] = []
const refresh = jest.fn()
function operation(reason: 'outside'|'mock', committed: unknown = false): OutboxOperation {
  const code = reason === 'outside' ? 'MTM_ATTENDANCE_LOCATION_OUTSIDE_REJECTED' : 'MTM_ATTENDANCE_LOCATION_MOCK_REJECTED'
  return {operationId:'fictional-rejected',scopeKey:'fictional-org:fictional-agent',entity:'workdays',op:'create',status:'conflict',data:{action:'START',id:'fictional-workday',occurredAt:'2026-10-13T08:00:00Z'},clientTimestamp:1,attempts:1,nextAttemptAt:0,conflict:{recordedAt:1,error:code,serverData:{code,committed}}}
}
async function render(value: OutboxOperation, language = 'ru') {
  await locale.changeLanguage(language); let tree!: TestRenderer.ReactTestRenderer
  await act(async () => { tree = TestRenderer.create(<I18nextProvider i18n={locale}><AttendanceMarkRecoveryCard operation={value} refresh={refresh} /></I18nextProvider>) })
  roots.push(tree); return tree
}
const button = (tree: TestRenderer.ReactTestRenderer) => tree.root.findAll(item => item.props.testID === 'attendance-mark-retry', {deep:false})[0]
function host(value: TestRenderer.ReactTestRendererJSON | TestRenderer.ReactTestRendererJSON[] | string | null): unknown {
  if (value === null || typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(host)
  return {type:value.type,props:Object.fromEntries(Object.entries(value.props).filter(([key])=>['style','testID','disabled','accessibilityRole'].includes(key))),children:value.children?.map(host) ?? null}
}
beforeAll(async () => { await locale.init({lng:'ru',fallbackLng:'ru',resources:{ru:{translation:ru},az:{translation:az},en:{translation:en}},interpolation:{escapeValue:false}}) })
beforeEach(() => { jest.clearAllMocks(); mockRetry.mockResolvedValue(undefined); refresh.mockResolvedValue(undefined) })
afterEach(async () => { await act(async () => roots.splice(0).forEach(root => root.unmount())) })
it.each(['ru','az','en'])('renders actual %s explanations and one deliberate new mark for both rejections', async language => {
  for (const reason of ['outside','mock'] as const) {
    const tree = await render(operation(reason),language), copy = {ru,az,en}[language as 'ru'|'az'|'en'].attendanceLocation
    const rendered = JSON.stringify(host(tree.toJSON()))
    expect(rendered).toContain(copy[`${reason}Title`]); expect(rendered).toContain(copy.retryTime); expect(rendered).not.toContain('attendanceLocation.')
    const directory = process.env.MTM_ATTENDANCE_RENDER_DIR
    if(directory) { mkdirSync(directory,{recursive:true}); writeFileSync(join(directory,`mark-${reason}-${language}.json`),JSON.stringify(host(tree.toJSON()),null,2)) }
    await act(async () => { button(tree).props.onPress() })
    expect(mockRetry).toHaveBeenLastCalledWith('fictional-org:fictional-agent','fictional-rejected')
  }
})
it.each([undefined,true,'false'])('keeps an unknown receipt immutable (committed=%s)', async committed => {
  const value=operation('outside'); value.conflict!.serverData={committed}
  const tree=await render(value); expect(button(tree)).toBeUndefined(); expect(JSON.stringify(host(tree.toJSON()))).toContain(ru.attendanceLocation.unknownReceipt)
})
it('ignores a double tap and never refreshes after leaving the screen', async () => {
  let finish!:()=>void; mockRetry.mockImplementationOnce(()=>new Promise<void>(done=>{finish=done}))
  const tree=await render(operation('mock'))
  await act(async()=>{button(tree).props.onPress();button(tree).props.onPress()}); expect(mockRetry).toHaveBeenCalledTimes(1)
  await act(async()=>tree.unmount()); await act(async()=>finish()); expect(refresh).not.toHaveBeenCalled()
})
it('keeps a failed operation actionable without inventing a saved time',async()=>{
  mockRetry.mockRejectedValueOnce(new Error('storage failed')); const tree=await render(operation('outside'))
  await act(async()=>button(tree).props.onPress()); expect(JSON.stringify(host(tree.toJSON()))).toContain(ru.attendanceLocation.retryFailed); expect(button(tree).props.disabled).toBe(false)
})
