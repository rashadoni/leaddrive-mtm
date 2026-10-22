jest.mock('../../src/services/api', () => ({ api: { getOwnAttendanceMarks: jest.fn() } }))
jest.mock('../../src/services/attendance-receipts', () => ({ attendanceReceiptAccount: jest.fn() }))
jest.mock('../../src/services/attendance-session-guard', () => ({ guardOfficeAttendance: jest.fn() }))
import { api } from '../../src/services/api'
import { attendanceReceiptAccount } from '../../src/services/attendance-receipts'
import { loadOwnAttendanceMarks, parseOwnAttendanceMarks } from '../../src/services/attendance-own-marks'
const account = { scope: 'fixture:employee', server: 'fixture.invalid' }
const item = { eventId: 'event-1', action: 'START', claimedAt: '2026-10-22T05:00:00Z', serverReceivedAt: '2026-10-22T05:01:00Z',
  location: { state: 'INSIDE', coordinates: { latitude: 40.5, longitude: 49.5 }, accuracyMeters: 12, capturedAt: '2026-10-22T05:00:00Z', branchName: 'Test branch', distanceMeters: 20 }, qr: null, review: { openCases: 0, closedCases: 1 } }
const report = { workdayId: 'day-1', workDate: '2026-10-22', timezone: 'Asia/Baku', updatedAt: '2026-10-22T06:00:00Z', hasMore: false, items: [item] }
beforeEach(() => { jest.clearAllMocks(); (attendanceReceiptAccount as jest.Mock).mockReturnValue(account) })
it('reads historical results through a guarded GET and strips unknown fields', async () => {
  ;(api.getOwnAttendanceMarks as jest.Mock).mockResolvedValue({ success: true, data: { ...report, items: [{ ...item, installationId: 'private', note: 'private' }] } })
  const result = await loadOwnAttendanceMarks(account, 'day-1', jest.fn())
  expect(api.getOwnAttendanceMarks).toHaveBeenCalledWith('day-1', expect.any(Function))
  expect(result.items[0]).toEqual(item); expect(JSON.stringify(result)).not.toContain('private')
})
it('does not return a late result after changing servers or leaving the screen', async () => {
  ;(api.getOwnAttendanceMarks as jest.Mock).mockImplementationOnce(async () => { (attendanceReceiptAccount as jest.Mock).mockReturnValue({ ...account, server: 'other.invalid' }); return { success: true, data: report } })
  await expect(loadOwnAttendanceMarks(account, 'day-1', jest.fn())).rejects.toThrow('ATTENDANCE_SCOPE_CHANGED')
  ;(attendanceReceiptAccount as jest.Mock).mockReturnValue(account)
  await expect(loadOwnAttendanceMarks(account, 'day-1', () => { throw new Error('screen closed') })).rejects.toThrow('screen closed')
})
it.each(['PAUSE', 'RESUME'])('refuses a server response that exposes coordinates for %s', action => {
  expect(() => parseOwnAttendanceMarks({ ...report, items: [{ ...item, action }] }, 'day-1')).toThrow('ATTENDANCE_MARKS_INVALID')
})
it('rejects another workday, duplicate events, invalid positions and unbounded data', () => {
  for (const input of [ { ...report, workdayId: 'foreign' }, { ...report, items: [item, item] }, { ...report, items: Array(65).fill(item) },
    { ...report, items: [{ ...item, location: { ...item.location, coordinates: { latitude: NaN, longitude: 50 } } }] },
    { ...report, items: [{ ...item, location: { ...item.location, state: 'NO_CONSENT' } }] } ]) {
    expect(() => parseOwnAttendanceMarks(input, 'day-1')).toThrow('ATTENDANCE_MARKS_INVALID')
  }
})
it('retains unavailable and uncertain findings without manufacturing outside presence', () => {
  expect(parseOwnAttendanceMarks({ ...report, items: [{ ...item, location: { ...item.location, state: 'UNAVAILABLE', coordinates: null, accuracyMeters: null, capturedAt: null, branchName: null, distanceMeters: null } }] }, 'day-1').items[0].location.state).toBe('UNAVAILABLE')
})
