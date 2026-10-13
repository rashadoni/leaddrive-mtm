export type AttendanceInstallation = {
  required: boolean
  installationLabel: string
  state: 'NOT_REQUESTED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED'
  requestId: string | null
  submittedAt: string | null
  decision: { action: 'APPROVE' | 'REJECT'; at: string; reason: string } | null
  revocation: { at: string; reason: string } | null
  canRequest: boolean
}
export type PendingAttendanceInstallation = { requestId: string; createdAt: string }
const object = (value: unknown): Record<string, unknown> | null => !!value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
export const installationRequestUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
const instant = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
const reason = (value: unknown): value is string => typeof value === 'string' && value.trim().length >= 3 && value.length <= 1000
export function parseAttendanceInstallation(value: unknown): AttendanceInstallation {
  const row=object(value), decision=object(row?.decision), revocation=object(row?.revocation)
  if (!row || typeof row.required !== 'boolean' || typeof row.canRequest !== 'boolean'
    || typeof row.installationLabel !== 'string' || row.installationLabel.length > 128
    || !['NOT_REQUESTED','PENDING','APPROVED','REJECTED','REVOKED'].includes(String(row.state))
    || !(row.requestId === null || installationRequestUuid(row.requestId)) || !(row.submittedAt === null || instant(row.submittedAt))
    || !(row.decision === null || decision && ['APPROVE','REJECT'].includes(String(decision.action)) && instant(decision.at) && reason(decision.reason))
    || !(row.revocation === null || revocation && instant(revocation.at) && reason(revocation.reason))) throw new Error('ATTENDANCE_INSTALLATION_INVALID')
  if (row.state !== 'NOT_REQUESTED' && (!row.requestId || !row.submittedAt)) throw new Error('ATTENDANCE_INSTALLATION_INVALID')
  if (row.state === 'NOT_REQUESTED' && (row.requestId !== null || row.submittedAt !== null || decision || revocation)) throw new Error('ATTENDANCE_INSTALLATION_INVALID')
  if (row.state === 'PENDING' && (decision || revocation)) throw new Error('ATTENDANCE_INSTALLATION_INVALID')
  if (row.state === 'REJECTED' && (decision?.action !== 'REJECT' || revocation)) throw new Error('ATTENDANCE_INSTALLATION_INVALID')
  if (row.state === 'REVOKED' && (decision?.action !== 'APPROVE' || !revocation)) throw new Error('ATTENDANCE_INSTALLATION_INVALID')
  if (row.canRequest === true && ['PENDING','APPROVED'].includes(String(row.state))) throw new Error('ATTENDANCE_INSTALLATION_INVALID')
  if (row.state === 'APPROVED' && (!decision || decision.action !== 'APPROVE' || revocation)) throw new Error('ATTENDANCE_INSTALLATION_INVALID')
  return {required:row.required,installationLabel:row.installationLabel,state:row.state as AttendanceInstallation['state'],requestId:row.requestId as string|null,submittedAt:row.submittedAt as string|null,
    decision:decision ? {action:decision.action as 'APPROVE'|'REJECT',at:decision.at as string,reason:decision.reason as string} : null,
    revocation:revocation ? {at:revocation.at as string,reason:revocation.reason as string} : null,canRequest:row.canRequest}
}
