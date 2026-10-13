/** Narrow, explicit protocol. This permission never grants field tracking. */
export type AttendanceConsentInput = { requestId: string; policyRevisionId: string; expectedConsentId: string | null; accepted: boolean }
export type AttendanceConsent = { id: string; policyRevisionId: string; accepted: boolean; createdAt: string }
export type OwnAttendanceLocation = {
  policy: { id: string; version: number; enabled: boolean; legalReviewConfirmed: boolean; texts: Record<'az' | 'ru' | 'en', string>; createdAt: string } | null
  consent: AttendanceConsent | null
  maySendLocation: boolean
}
export type AttendanceMark = {
  version: 1; installationId: string; locationState: 'AVAILABLE' | 'UNAVAILABLE' | 'NO_CONSENT'; consentRevisionId: string | null
  location: { latitude: number; longitude: number; accuracy: number; capturedAt: string; provider: 'UNKNOWN'; isMock: boolean } | null
}
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 191
const instant = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
export function parseAttendanceConsent(value: unknown): AttendanceConsent {
  const row = object(value)
  if (!row || !id(row.id) || !id(row.policyRevisionId) || typeof row.accepted !== 'boolean' || !instant(row.createdAt)) throw new Error('ATTENDANCE_LOCATION_INVALID')
  return { id: row.id, policyRevisionId: row.policyRevisionId, accepted: row.accepted, createdAt: row.createdAt }
}
export function parseOwnAttendanceLocation(value: unknown): OwnAttendanceLocation {
  const row = object(value)
  if (!row || typeof row.maySendLocation !== 'boolean' || row.policy === undefined || row.consent === undefined) throw new Error('ATTENDANCE_LOCATION_INVALID')
  const consent = row.consent === null ? null : parseAttendanceConsent(row.consent)
  let policy: OwnAttendanceLocation['policy'] = null
  if (row.policy !== null) {
    const p = object(row.policy), texts = object(p?.texts)
    if (!p || !id(p.id) || !Number.isInteger(p.version) || Number(p.version) < 1 || typeof p.enabled !== 'boolean'
      || typeof p.legalReviewConfirmed !== 'boolean' || !instant(p.createdAt) || !texts
      || ['az', 'ru', 'en'].some(lang => typeof texts[lang] !== 'string' || (texts[lang] as string).length > 8000)) throw new Error('ATTENDANCE_LOCATION_INVALID')
    policy = { id: p.id, version: Number(p.version), enabled: p.enabled, legalReviewConfirmed: p.legalReviewConfirmed,
      createdAt: p.createdAt, texts: { az: texts.az as string, ru: texts.ru as string, en: texts.en as string } }
  }
  const valid = policy?.enabled === true && policy.legalReviewConfirmed === true && consent?.accepted === true && consent.policyRevisionId === policy.id
    && Object.values(policy.texts).every(text => text.trim().length >= 20)
  if (row.maySendLocation && !valid) throw new Error('ATTENDANCE_LOCATION_INVALID')
  return { policy, consent, maySendLocation: row.maySendLocation && valid }
}
/** Only these three fields may change after an ambiguous upload. */
export function redactAttendanceMarkData(data: Record<string, unknown>): Record<string, unknown> {
  const mark = object(data.attendanceMark)
  if (!mark) return data
  return { ...data, attendanceMark: { ...mark, locationState: 'NO_CONSENT', location: null, consentRevisionId: null } }
}
