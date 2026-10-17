/**
 * Pure mapper for the Manager approvals queue (GET /mobile/manager/approvals).
 * Flattens the pending categories for the review list while retaining an
 * inspectable summary of the exact contact payload a Manager is deciding.
 */

export interface ApprovalItem {
  id: string
  agentName: string
  primary: string
  details?: string
  reason?: string
  submittedAt?: string
}

export interface ManagerApprovals {
  hrm: ApprovalItem[]
  routeChanges: ApprovalItem[]
  customers: ApprovalItem[]
  contactChanges: ApprovalItem[]
  total: number
}

function str(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  const s = String(value)
  return s.length > 0 ? s : undefined
}

function payloadSummary(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const rows = Object.entries(value as Record<string, unknown>)
    .filter(([, field]) => field !== undefined)
    .map(([key, field]) => `${key}: ${field === null ? "—" : String(field)}`)
  return rows.length > 0 ? rows.join(" · ") : undefined
}

export function toApprovals(raw: any): ManagerApprovals {
  const hrmRaw = Array.isArray(raw?.hrm) ? (raw.hrm as any[]) : []
  const routeChangesRaw = Array.isArray(raw?.routeChanges) ? (raw.routeChanges as any[]) : []
  const customersRaw = Array.isArray(raw?.customers) ? (raw.customers as any[]) : []
  const contactChangesRaw = Array.isArray(raw?.contactChanges) ? (raw.contactChanges as any[]) : []

  const hrm = hrmRaw.map((r) => ({
    id: String(r?.id ?? ""),
    agentName: str(r?.agent?.name) ?? "",
    primary: str(r?.type) ?? "",
    reason: str(r?.reason),
    submittedAt: str(r?.submittedAt),
  }))
  const routeChanges = routeChangesRaw.map((r) => ({
    id: String(r?.id ?? ""),
    agentName: str(r?.requestedByAgent?.name) ?? "",
    primary: str(r?.changeType) ?? "",
    reason: str(r?.reason),
    submittedAt: str(r?.submittedAt),
  }))
  const customers = customersRaw.map((r) => ({
    id: String(r?.id ?? ""),
    agentName: str(r?.requestedByAgent?.name) ?? "",
    primary: [str(r?.name), str(r?.objectType)].filter(Boolean).join(" · "),
    reason: str(r?.reason),
    submittedAt: str(r?.submittedAt),
  }))
  const contactChanges = contactChangesRaw.map((r) => ({
    id: String(r?.id ?? ""),
    agentName: str(r?.requestedByAgent?.name) ?? "",
    primary: [str(r?.contact?.displayName), str(r?.kind)].filter(Boolean).join(" · "),
    details: payloadSummary(r?.payload),
    reason: str(r?.reason),
    submittedAt: str(r?.submittedAt),
  }))

  return { hrm, routeChanges, customers, contactChanges, total: hrm.length + routeChanges.length + customers.length + contactChanges.length }
}

/**
 * An agent's route that is saved and waits for the manager to publish it.
 *
 * 2026-10-06: an agent built his route, the app said «saved», and he could not
 * start it — it was a draft, and nothing told the manager. The rule is the
 * server's (src/lib/mtm/routes-awaiting-publish.ts): a DRAFT whose day has not
 * passed and that has at least one stop; the nearest day first, because that
 * agent is the one standing still.
 */
export interface RouteDraftApproval {
  id: string
  /** The version the manager saw; publishing an older one is refused. */
  version: number
  /** Calendar day, YYYY-MM-DD. */
  date: string
  agentName: string
  stops: number
  name?: string
}

function dateKey(value: unknown): string | null {
  const raw = str(value)
  if (!raw || !/^\d{4}-\d{2}-\d{2}/.test(raw)) return null
  return raw.slice(0, 10)
}

export function routeDraftsAwaitingPublish(raw: any, todayKey: string): RouteDraftApproval[] {
  const routes: any[] = Array.isArray(raw?.routes) ? raw.routes : []
  return routes
    .map((route): RouteDraftApproval | null => {
      const id = str(route?.id)
      const date = dateKey(route?.date)
      const version = Number(route?.version)
      if (!id || !date || route?.status !== "DRAFT" || !Number.isInteger(version) || version < 1) return null
      const points = Array.isArray(route?.points) ? route.points.length : 0
      const total = Number(route?.totalPoints)
      const stops = Math.max(Number.isFinite(total) ? total : 0, points)
      return {
        id,
        version,
        date,
        agentName: str(route?.agent?.name)?.trim() || "—",
        stops,
        name: str(route?.name)?.trim() || undefined,
      }
    })
    .filter((item): item is RouteDraftApproval => item !== null && item.date >= todayKey && item.stops > 0)
    .sort((left, right) => left.date.localeCompare(right.date) || left.agentName.localeCompare(right.agentName))
}

/** The query window for those drafts: from today, as far as the server lets one read reach. */
export function routeDraftWindow(todayKey: string): { start: string; endExclusive: string } {
  const [year, month, day] = todayKey.split("-").map(Number)
  const end = new Date(Date.UTC(year, month - 1, day + 366))
  return { start: todayKey, endExclusive: end.toISOString().slice(0, 10) }
}

/** An agent's request to add a doctor who is not in the base yet. */
export interface DoctorRequestApproval {
  id: string
  agentName: string
  displayName: string
  specialtyName?: string
  clinicName: string
  address?: string
  phone?: string
  notes?: string
  submittedAt?: string
}

const OPEN_DOCTOR_REQUEST = new Set(["SUBMITTED", "IN_REVIEW", "NEEDS_INFO"])

export function toDoctorRequestApprovals(raw: any): DoctorRequestApproval[] {
  const requests: any[] = Array.isArray(raw?.requests) ? raw.requests : []
  return requests
    .filter((request) => OPEN_DOCTOR_REQUEST.has(String(request?.status ?? "").toUpperCase()))
    .map((request): DoctorRequestApproval | null => {
      const id = str(request?.id)
      const displayName = str(request?.displayName)?.trim()
      if (!id || !displayName) return null
      return {
        id,
        agentName: str(request?.requestedByAgent?.name)?.trim() ?? "",
        displayName,
        specialtyName: str(request?.specialtyName)?.trim() || undefined,
        clinicName: str(request?.clinicName)?.trim() ?? "",
        address: str(request?.address)?.trim() || undefined,
        phone: str(request?.phone)?.trim() || undefined,
        notes: str(request?.notes)?.trim() || undefined,
        submittedAt: str(request?.submittedAt),
      }
    })
    .filter((item): item is DoctorRequestApproval => item !== null)
}

type Refusal = { code?: unknown; status?: unknown; message?: unknown } | null | undefined

/**
 * What a refused publish means, as a managerShell.* message key — never the
 * code itself. `reload` says the list on screen is no longer the truth.
 */
export function routePublishRefusal(error: Refusal): { key: string; reload: boolean } {
  const code = typeof error?.code === "string" ? error.code : ""
  switch (code) {
    case "ROUTE_VERSION_CONFLICT": return { key: "managerShell.publishVersionConflict", reload: true }
    case "ROUTE_TRANSITION_INVALID": return { key: "managerShell.publishNotDraft", reload: true }
    case "ROUTE_EMPTY": return { key: "managerShell.publishEmpty", reload: true }
    case "ROUTE_CONFLICT": return { key: "managerShell.publishScheduleConflict", reload: false }
    case "ROUTE_POINT_TIME_CONFLICT": return { key: "managerShell.publishTimeConflict", reload: false }
    case "MTM_ROUTE_SCOPE_DENIED": return { key: "managerShell.publishForbidden", reload: true }
  }
  if (error?.status === 404) return { key: "managerShell.decisionGone", reload: true }
  if (error?.status === 403) return { key: "managerShell.publishForbidden", reload: true }
  return { key: "managerShell.decisionFailed", reload: false }
}

/** The same for a decision on a new-doctor request. */
export function doctorDecisionRefusal(error: Refusal): { key: string; reload: boolean } {
  const code = typeof error?.code === "string" ? error.code : ""
  switch (code) {
    case "MTM_CONTACT_CREATE_DUPLICATE": return { key: "managerShell.doctorDuplicate", reload: false }
    case "MTM_CONTACT_CREATE_ALREADY_DECIDED": return { key: "managerShell.doctorAlreadyDecided", reload: true }
    case "MTM_CONTACT_CREATE_CONFLICT": return { key: "managerShell.doctorBeingDecided", reload: true }
    case "MTM_SELF_REVIEW_DENIED": return { key: "managerShell.doctorOwnRequest", reload: false }
  }
  if (error?.status === 404) return { key: "managerShell.decisionGone", reload: true }
  if (error?.status === 403) return { key: "managerShell.doctorForbidden", reload: false }
  return { key: "managerShell.decisionFailed", reload: false }
}

/**
 * An employee's Personnel request (leave, sick leave, a time correction…)
 * waiting for the manager, as GET /mobile/manager/approvals sends it in
 * `data.attendance`. Separate from the Workforce `hrm` queue above.
 */
export interface AttendanceApproval {
  id: string
  /** The request's `updatedAt`; the decision must carry it back. */
  version: string
  employeeName: string
  teamName?: string
  kind: string
  unit: "DAYS" | "HOURS"
  startDate: string
  endDate: string
  startTime?: string
  endTime?: string
  /** The tenant's own name for the day kind, when the request names one. */
  dayKindNames?: { az?: string; ru?: string; en?: string }
  reason?: string
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/
const CLOCK = /^\d{2}:\d{2}/

export function toAttendanceApprovals(raw: any): AttendanceApproval[] {
  const items: any[] = Array.isArray(raw?.attendance) ? raw.attendance : []
  return items
    .filter((item) => String(item?.status ?? "PENDING").toUpperCase() === "PENDING")
    .map((item): AttendanceApproval | null => {
      const id = str(item?.id)
      const version = str(item?.version)
      const startDate = str(item?.startDate)?.slice(0, 10)
      const endDate = str(item?.endDate)?.slice(0, 10) ?? startDate
      const details = item?.details && typeof item.details === "object" ? item.details : {}
      const kind = str(details.kind)
      if (!id || !version || !startDate || !endDate || !DATE_KEY.test(startDate) || !DATE_KEY.test(endDate) || !kind) return null
      const names = details.dayKind?.names && typeof details.dayKind.names === "object" ? details.dayKind.names : null
      const startTime = str(details.startTime)
      const endTime = str(details.endTime)
      return {
        id,
        version,
        employeeName: str(item?.employeeName)?.trim() || "—",
        teamName: str(item?.teamName)?.trim() || undefined,
        kind,
        unit: details.unit === "HOURS" ? "HOURS" : "DAYS",
        startDate,
        endDate,
        startTime: startTime && CLOCK.test(startTime) ? startTime.slice(0, 5) : undefined,
        endTime: endTime && CLOCK.test(endTime) ? endTime.slice(0, 5) : undefined,
        dayKindNames: names
          ? { az: str(names.az)?.trim() || undefined, ru: str(names.ru)?.trim() || undefined, en: str(names.en)?.trim() || undefined }
          : undefined,
        reason: str(item?.reason)?.trim() || undefined,
      }
    })
    .filter((item): item is AttendanceApproval => item !== null)
}

/** The kind in words: the tenant's day-kind name in the app language, else the app's own word for the kind. */
export function attendanceKindLabel(item: AttendanceApproval, language: string, t: (key: string) => string): string {
  const locale = language.toLowerCase().startsWith("az") ? "az" : language.toLowerCase().startsWith("en") ? "en" : "ru"
  const own = item.dayKindNames?.[locale]
  if (own) return own
  const key = `attendanceRequests.kinds.${item.kind}`
  const word = t(key)
  return word && word !== key ? word : t("attendanceRequests.kind")
}

/** «17 oktyabr» or «17 oktyabr — 20 oktyabr»; with the hours when the request is by the hour. */
export function attendancePeriod(item: AttendanceApproval, formatDay: (dateKey: string) => string): string {
  const days = item.startDate === item.endDate ? formatDay(item.startDate) : `${formatDay(item.startDate)} — ${formatDay(item.endDate)}`
  if (item.unit !== "HOURS" || !item.startTime) return days
  return `${days}, ${item.startTime}${item.endTime ? `–${item.endTime}` : ""}`
}

/** A rejection must say why: the server refuses a reason shorter than this. */
export const ATTENDANCE_REJECT_NOTE_MIN = 3

/** What a refused decision on a Personnel request means, as a managerShell.* key. */
export function attendanceDecisionRefusal(error: Refusal): { key: string; reload: boolean } {
  const code = typeof error?.code === "string" ? error.code : ""
  switch (code) {
    case "MTM_ATTENDANCE_REQUEST_CHANGED":
    case "MTM_ATTENDANCE_REQUEST_ALREADY_DECIDED": return { key: "managerShell.attendanceChanged", reload: true }
    case "MTM_ATTENDANCE_DECISION_FORBIDDEN": return { key: "managerShell.attendanceForbidden", reload: false }
    case "MTM_ATTENDANCE_REQUEST_SELF_APPROVAL": return { key: "managerShell.attendanceOwnRequest", reload: false }
    case "MTM_ATTENDANCE_REQUEST_NOT_FOUND": return { key: "managerShell.decisionGone", reload: true }
    case "MTM_ATTENDANCE_DISABLED": return { key: "managerShell.attendanceDisabled", reload: true }
  }
  return { key: "managerShell.decisionFailed", reload: false }
}
