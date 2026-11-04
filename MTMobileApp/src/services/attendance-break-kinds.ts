import type { AttendanceBreakKind } from "./bootstrap"

type T = (key: string, options?: Record<string, unknown>) => string
const BUILT_IN = ["smoke", "lunch", "personal"]

/** A built-in kind has no stored name: the app names it in its own language. */
export function attendanceBreakKindName(kind: Pick<AttendanceBreakKind, "id" | "name">, t: T) {
  return kind.name ?? (BUILT_IN.includes(kind.id) ? t(`attendanceBreaks.kind_${kind.id}`) : t("attendanceBreaks.kindNone"))
}
/** «today 12 of 30 min» / «no limit · today 5 min». */
export function attendanceBreakUsage(kind: AttendanceBreakKind, t: T) {
  const used = Math.floor(kind.usedSeconds / 60)
  return kind.limitMinutes === null ? (used ? t("attendanceBreaks.usedNoLimit", { used }) : t("attendanceBreaks.noLimit"))
    : t("attendanceBreaks.used", { used, limit: kind.limitMinutes })
}
export const attendanceBreakOverLimit = (kind: AttendanceBreakKind) => kind.limitMinutes !== null && kind.usedSeconds > kind.limitMinutes * 60
