import { attendanceCorrectionDraft, createAttendanceCorrectionIntent } from '../../src/services/attendance-correction-intent'
const context = { scope: 'org:employee', server: 'fixture.invalid', timezone: 'Asia/Baku' }
const day = { workDate: '2026-10-21', startedAt: '2026-10-21T18:00:00Z', completedAt: '2026-10-22T02:00:00Z' }
const intent = () => createAttendanceCorrectionIntent(context.scope, context.server, context.timezone, day)!
it('prefills the company civil dates of an overnight day without submitting or inventing a reason', () => {
  expect(attendanceCorrectionDraft(intent(), context)).toEqual(expect.objectContaining({ kind: 'TIME_CORRECTION', unit: 'HOURS', startDate: '2026-10-21', endDate: '2026-10-22', startTime: '22:00', endTime: '06:00', reason: '', attachmentIds: [] }))
})
it('leaves an unknown finish blank instead of guessing scheduled or current time', () => {
  const input = createAttendanceCorrectionIntent(context.scope, context.server, context.timezone, { startedAt: day.startedAt })
  expect(attendanceCorrectionDraft(input, context)).toMatchObject({ startDate: '2026-10-21', endDate: '2026-10-21', startTime: '22:00' })
  expect(attendanceCorrectionDraft(input, context)?.endTime).toBeUndefined()
})
it.each(['scope', 'server', 'timezone'] as const)('refuses a suggestion from a different %s', field => {
  expect(attendanceCorrectionDraft({ ...intent(), [field]: 'other' }, context)).toBeNull()
})
it('rejects invalid times and an inconsistent work date', () => {
  expect(attendanceCorrectionDraft({ ...intent(), workDate: '2026-10-20' }, context)).toBeNull()
  expect(attendanceCorrectionDraft({ ...intent(), completedAt: 'invalid' }, context)).toBeNull()
  expect(createAttendanceCorrectionIntent(context.scope, context.server, 'invalid', { startedAt: day.startedAt })).toBeNull()
})
