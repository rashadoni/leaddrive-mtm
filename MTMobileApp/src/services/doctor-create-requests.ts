/**
 * What happened to the doctors this agent asked for.
 *
 * A request used to leave the phone and vanish: approved, refused and still
 * waiting all looked the same, and the only signal was the doctor quietly
 * appearing in the list a day later — or never. The server now answers with
 * the agent's own requests; this module turns them into something a person
 * can read, and holds the rules about which ones are worth showing.
 */

export type DoctorRequestStatus = "SUBMITTED" | "IN_REVIEW" | "NEEDS_INFO" | "APPROVED" | "REJECTED" | "CANCELLED"

export interface DoctorCreateRequestItem {
  id: string
  status: DoctorRequestStatus
  displayName: string
  clinicName: string
  specialtyName?: string
  decisionComment?: string
  submittedAt?: string
  reviewedAt?: string
}

const STATUSES: DoctorRequestStatus[] = ["SUBMITTED", "IN_REVIEW", "NEEDS_INFO", "APPROVED", "REJECTED", "CANCELLED"]

function text(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  const normalized = String(value).trim()
  return normalized.length > 0 ? normalized : undefined
}

export function toDoctorCreateRequestItem(raw: any): DoctorCreateRequestItem | null {
  const id = text(raw?.id)
  const displayName = text(raw?.displayName)
  if (!id || !displayName) return null
  const rawStatus = String(raw?.status ?? "").toUpperCase()
  // An unknown status is treated as waiting: the request exists, and telling
  // the agent it was approved would be worse than telling them to wait.
  const status = (STATUSES as string[]).includes(rawStatus) ? (rawStatus as DoctorRequestStatus) : "SUBMITTED"
  return {
    id,
    status,
    displayName,
    clinicName: text(raw?.clinicName) ?? "",
    specialtyName: text(raw?.specialtyName),
    decisionComment: text(raw?.decisionComment),
    submittedAt: text(raw?.submittedAt),
    reviewedAt: text(raw?.reviewedAt),
  }
}

export const DOCTOR_REQUEST_COPY = {
  ru: {
    title: "Мои заявки на врачей",
    SUBMITTED: "Ждёт менеджера",
    IN_REVIEW: "На проверке",
    NEEDS_INFO: "Нужны уточнения",
    APPROVED: "Одобрена",
    REJECTED: "Отклонена",
    CANCELLED: "Отменена",
  },
  az: {
    title: "Həkim üçün sorğularım",
    SUBMITTED: "Menecer gözləyir",
    IN_REVIEW: "Yoxlanılır",
    NEEDS_INFO: "Dəqiqləşdirmə lazımdır",
    APPROVED: "Təsdiqlənib",
    REJECTED: "İmtina edilib",
    CANCELLED: "Ləğv edilib",
  },
  en: {
    title: "My doctor requests",
    SUBMITTED: "Waiting for the manager",
    IN_REVIEW: "Under review",
    NEEDS_INFO: "More detail needed",
    APPROVED: "Approved",
    REJECTED: "Declined",
    CANCELLED: "Cancelled",
  },
} as const

export type DoctorRequestLanguage = keyof typeof DOCTOR_REQUEST_COPY

export function doctorRequestLanguage(language: string): DoctorRequestLanguage {
  const value = language.toLowerCase()
  if (value.startsWith("az")) return "az"
  if (value.startsWith("en")) return "en"
  return "ru"
}

export type DoctorRequestTone = "waiting" | "attention" | "done" | "refused"

export function doctorRequestTone(status: DoctorRequestStatus): DoctorRequestTone {
  if (status === "APPROVED") return "done"
  if (status === "REJECTED" || status === "CANCELLED") return "refused"
  if (status === "NEEDS_INFO") return "attention"
  return "waiting"
}

/**
 * What the agent needs on the clients screen: everything still open, plus the
 * decisions recent enough to be news. An approval from last month is the
 * doctor in the list above, not a notice.
 */
export const DOCTOR_REQUEST_RECENT_DAYS = 7

export function visibleDoctorRequests(
  items: DoctorCreateRequestItem[],
  now: number = Date.now(),
  limit = 5,
): DoctorCreateRequestItem[] {
  const recentSince = now - DOCTOR_REQUEST_RECENT_DAYS * 24 * 60 * 60 * 1000
  return items
    .filter((item) => {
      const tone = doctorRequestTone(item.status)
      if (tone === "waiting" || tone === "attention") return true
      const decidedAt = item.reviewedAt ? Date.parse(item.reviewedAt) : Number.NaN
      return Number.isFinite(decidedAt) && decidedAt >= recentSince
    })
    .slice(0, Math.max(0, limit))
}
