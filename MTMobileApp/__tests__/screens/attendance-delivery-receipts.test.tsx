jest.mock("react-native-vector-icons/Ionicons", () => "Icon")
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import i18next from 'i18next'
import { I18nextProvider } from 'react-i18next'
import AttendanceDeliveryReceipts from '../../src/components/AttendanceDeliveryReceipts'
import ru from '../../src/i18n/locales/ru.json'
import az from '../../src/i18n/locales/az.json'
import en from '../../src/i18n/locales/en.json'
import type { AttendanceReceiptRow } from '../../src/services/attendance-receipt-contract'
const row: AttendanceReceiptRow = { operationId: 'one', workdayId: 'day', action: 'START', occurredAt: '2026-10-22T05:02:00Z', delivery: 'LOCAL', receivedAt: null, review: null }
it.each(['ru', 'az', 'en'] as const)('distinguishes saved, delivered and delayed marks in %s', async language => {
  const locale = i18next.createInstance()
  await locale.init({ lng: language, resources: { ru: { translation: ru }, az: { translation: az }, en: { translation: en } }, interpolation: { escapeValue: false } })
  let tree!: TestRenderer.ReactTestRenderer
  const render = (rows: AttendanceReceiptRow[]) => <I18nextProvider i18n={locale}><AttendanceDeliveryReceipts rows={rows} failed={false} timezone="Asia/Baku" /></I18nextProvider>
  await act(async () => { tree = TestRenderer.create(render([row])) })
  const copy = { ru, az, en }[language].attendanceReceipts
  expect(JSON.stringify(tree.toJSON())).toContain(copy.LOCAL)
  expect(JSON.stringify(tree.toJSON())).not.toContain(copy.RECEIVED)
  await act(async () => tree.update(render([{ ...row, delivery: 'RECEIVED', receivedAt: '2026-10-22T07:00:00Z', review: 'PENDING_REVIEW' }])))
  const text = JSON.stringify(tree.toJSON())
  expect(text).toContain(copy.RECEIVED); expect(text).toContain(copy.delayedAtDelivery)
  expect(text).toContain(copy.deliveryNotApproval); expect(text).toContain('09:02'); expect(text).toContain('11:00')
  expect(text).not.toContain(copy.LOCAL); expect(text).not.toContain('attendanceReceipts.')
  await act(async () => tree.unmount())
})

it('keeps delivery failures, conflicts and HR review explicit while compact receipts are collapsed', async () => {
  const locale = i18next.createInstance(); await locale.init({lng:'ru',resources:{ru:{translation:ru}}})
  const rows: AttendanceReceiptRow[] = [row,{...row,operationId:'conflict',delivery:'CONFLICT'}, {...row,operationId:'delivered',delivery:'RECEIVED',review:'PENDING_REVIEW'}]
  let tree!: TestRenderer.ReactTestRenderer
  const render = (failed=false) => <I18nextProvider i18n={locale}><AttendanceDeliveryReceipts compact rows={rows} failed={failed} timezone="Asia/Baku" /></I18nextProvider>
  await act(async () => { tree=TestRenderer.create(render()) })
  const node=(id:string)=>tree.root.findAll(item=>item.props.testID===id,{deep:false})[0]
  expect(node('attendance-receipts-review-summary')).toBeDefined()
  expect(node('attendance-receipt-conflict')).toBeUndefined()
  expect(JSON.stringify(tree.toJSON())).toContain('Требуют внимания: 1')
  await act(async () => node('attendance-receipts-disclosure').props.onPress())
  expect(node('attendance-receipt-local')).toBeDefined(); expect(node('attendance-receipt-conflict')).toBeDefined()
  await act(async () => node('attendance-receipts-disclosure').props.onPress())
  await act(async () => tree.update(render(true)))
  const text=JSON.stringify(tree.toJSON());expect(text).toContain(ru.attendanceCompact.unknown);expect(text).toContain(ru.attendanceReceipts.loadFailed)
  expect(text).not.toContain(ru.attendanceCompact.received)
  await act(async () => tree.unmount())
})
