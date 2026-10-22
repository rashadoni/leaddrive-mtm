import type { AttendanceCorrectionIntent } from '../services/attendance-correction-intent'

/** Shared own-attendance destinations: office tabs and the manager stack. */
export type OwnAttendanceParamList = {
  OwnRequests: { correction?: AttendanceCorrectionIntent } | undefined
  OwnExplanations: undefined
  OwnInbox: undefined
  OwnProfile: undefined
}
