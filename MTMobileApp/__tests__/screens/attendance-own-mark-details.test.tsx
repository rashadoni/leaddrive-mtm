import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import i18next from 'i18next'
import { I18nextProvider } from 'react-i18next'
import ru from '../../src/i18n/locales/ru.json'
import { officeAgent, officeBootstrap } from '../../test-support/office-attendance'
const mockAuth = { isLoggedIn: true, serverDomain: 'fixture.invalid', agent: officeAgent }
const mockBootstrap = { data: officeBootstrap() }
jest.mock('../../src/store/auth', () => ({ useAuthStore: () => mockAuth }))
jest.mock('../../src/store/bootstrap', () => ({ useBootstrapStore: (selector: (value: unknown) => unknown) => selector(mockBootstrap) }))
jest.mock('../../src/services/attendance-receipts', () => ({ attendanceReceiptAccount: () => ({ scope: 'fixture:employee', server: mockAuth.serverDomain }) }))
jest.mock('../../src/services/attendance-own-marks', () => ({ loadOwnAttendanceMarks: jest.fn() }))
import AttendanceOwnMarkDetails from '../../src/components/AttendanceOwnMarkDetails'
import { loadOwnAttendanceMarks } from '../../src/services/attendance-own-marks'
const report = { timezone: 'Asia/Baku', updatedAt: '2026-10-22T06:00:00Z', hasMore: false, items: [{ eventId: 'one', action: 'START', claimedAt: '2026-10-22T05:00:00Z',
  location: { state: 'INSIDE', coordinates: { latitude: 40.5, longitude: 49.5 }, accuracyMeters: 12, capturedAt: null, distanceMeters: 20, branchName: 'Test branch' }, qr: null, review: { openCases: 1, closedCases: 0 } }] }
it('loads only on request and immediately hides private evidence when the account changes', async () => {
  const locale = i18next.createInstance(); await locale.init({ lng: 'ru', resources: { ru: { translation: ru } }, interpolation: { escapeValue: false } })
  ;(loadOwnAttendanceMarks as jest.Mock).mockResolvedValue(report)
  const screen = () => <I18nextProvider i18n={locale}><AttendanceOwnMarkDetails workdayId="day-1" /></I18nextProvider>
  let tree!: TestRenderer.ReactTestRenderer
  await act(async () => { tree = TestRenderer.create(screen()) })
  expect(loadOwnAttendanceMarks).not.toHaveBeenCalled()
  await act(async () => { await tree.root.findAllByProps({ testID: 'attendance-mark-details-load' })[0].props.onPress() })
  expect(JSON.stringify(tree.toJSON())).toContain('40.50000')
  expect(JSON.stringify(tree.toJSON())).toContain(ru.attendanceMarks.INSIDE)
  mockAuth.serverDomain = 'other.invalid'
  await act(async () => tree.update(screen()))
  expect(JSON.stringify(tree.toJSON())).not.toContain('40.50000')
  await act(async () => tree.unmount()); mockAuth.serverDomain = 'fixture.invalid'
})
