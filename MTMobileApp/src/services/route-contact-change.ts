import type { RouteContactDetail } from "./route-contact-detail"

/**
 * "Propose a change" on a client card — the rules of the form, kept free of
 * React Native so they are tested on their own.
 *
 * An agent never changes a client. They tell a manager what they learned on a
 * visit; the manager approves or declines, and only then does the card change.
 * The server says what may be proposed (the `changeRequest` block of the v2
 * card): whether the organization allows the request at all, which fields, and
 * the organization's own lists of classes and specialties. The app offers
 * exactly that, so it never sends something the server would refuse.
 */
export const ROUTE_CONTACT_CHANGE_FIELDS = ["category", "specialtyName", "firstName", "lastName"] as const
export type RouteContactChangeField = typeof ROUTE_CONTACT_CHANGE_FIELDS[number]

export interface RouteContactChangeRequest {
  id: string
  status: string
  reason?: string
  decisionComment?: string
  submittedAt?: string
  reviewedAt?: string
}

export interface RouteContactChangeOffer {
  /** The organization lets its agents propose changes (web matrix "what an agent may do"). */
  allowed: boolean
  fields: RouteContactChangeField[]
  classes: string[]
  specialties: string[]
  /** What became of this agent's last request for this client. */
  latest?: RouteContactChangeRequest
}

export type RouteContactChangeForm = Record<RouteContactChangeField, string>
export type RouteContactChanges = Partial<Record<RouteContactChangeField, string>>
export type RouteContactChangeProblem = "name" | "nothing" | "reason"

/** The server's minimum for the agent's explanation. */
export const ROUTE_CONTACT_CHANGE_REASON_MIN = 3

function text(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  const trimmed = String(value).trim()
  return trimmed || undefined
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap((item) => text(item) ?? []) : []
}

/**
 * The offer as the server sent it. A server that does not send the block yet
 * allows nothing — the card stays read-only, as it was before the form existed.
 */
export function toRouteContactChangeOffer(raw: any): RouteContactChangeOffer {
  const fields = strings(raw?.fields)
    .filter((field): field is RouteContactChangeField => (ROUTE_CONTACT_CHANGE_FIELDS as readonly string[]).includes(field))
  const latest = raw?.latest && typeof raw.latest === "object" && text(raw.latest.id)
    ? {
        id: String(raw.latest.id),
        status: text(raw.latest.status) ?? "",
        reason: text(raw.latest.reason),
        decisionComment: text(raw.latest.decisionComment),
        submittedAt: text(raw.latest.submittedAt),
        reviewedAt: text(raw.latest.reviewedAt),
      }
    : undefined
  return {
    allowed: raw?.allowed === true && fields.length > 0,
    fields,
    classes: strings(raw?.classes),
    specialties: strings(raw?.specialties),
    latest,
  }
}

/** A request the manager has not answered yet. */
export function isRouteContactChangePending(status: string | undefined): boolean {
  return status === "SUBMITTED" || status === "IN_REVIEW" || status === "NEEDS_INFO"
}

export type RouteContactChangeTone = "pending" | "approved" | "declined"

/** How the card paints the last request; null for a status worth no line (draft, cancelled). */
export function routeContactChangeTone(status: string | undefined): RouteContactChangeTone | null {
  if (isRouteContactChangePending(status)) return "pending"
  if (status === "APPROVED") return "approved"
  if (status === "REJECTED") return "declined"
  return null
}

/**
 * Whether the card offers the way into the form: the organization allows the
 * request, and the agent has no request still waiting — a second one against
 * the same version of the card could not be approved after the first.
 */
export function canProposeRouteContactChange(offer: RouteContactChangeOffer, detail: RouteContactDetail | null): boolean {
  return offer.allowed && !!detail?.updatedAt && !isRouteContactChangePending(offer.latest?.status)
}

export function initialRouteContactChangeForm(detail: RouteContactDetail): RouteContactChangeForm {
  return {
    category: detail.category ?? "",
    specialtyName: detail.specialty ?? "",
    firstName: detail.firstName ?? "",
    lastName: detail.lastName ?? "",
  }
}

/** Only what the agent changed, only in the fields the organization offers. */
export function routeContactChanges(
  detail: RouteContactDetail,
  form: RouteContactChangeForm,
  fields: readonly RouteContactChangeField[],
): RouteContactChanges {
  const before = initialRouteContactChangeForm(detail)
  const changes: RouteContactChanges = {}
  for (const field of fields) {
    const value = form[field].trim()
    if (value && value !== before[field]) changes[field] = value
  }
  return changes
}

/** What stops the request from being sent, most useful first; null when it can go. */
export function routeContactChangeProblem(
  detail: RouteContactDetail,
  form: RouteContactChangeForm,
  fields: readonly RouteContactChangeField[],
  reason: string,
): RouteContactChangeProblem | null {
  const nameFields = fields.filter((field) => field === "firstName" || field === "lastName")
  if (nameFields.some((field) => !form[field].trim())) return "name"
  if (Object.keys(routeContactChanges(detail, form, fields)).length === 0) return "nothing"
  if (reason.trim().length < ROUTE_CONTACT_CHANGE_REASON_MIN) return "reason"
  return null
}

/** The specialties to show for what the agent typed; everything when they typed nothing. */
export function matchingSpecialties(specialties: readonly string[], query: string): string[] {
  const wanted = query.trim().toLocaleLowerCase()
  if (!wanted) return [...specialties]
  return specialties.filter((name) => name.toLocaleLowerCase().includes(wanted))
}

export type RouteContactChangeFailure = "disabled" | "stale" | "incomplete" | "listChanged" | "failed"

/** The server's refusal, as the thing the agent can do about it. */
export function routeContactChangeFailure(error: unknown): RouteContactChangeFailure {
  const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined
  if (code === "MTM_AGENT_PERMISSION_DISABLED") return "disabled"
  if (code === "MTM_CONTACT_CONFLICT") return "stale"
  if (code === "MTM_CONTACT_REQUIRED_FIELDS") return "incomplete"
  if (
    code === "MTM_CONTACT_CLASS_NOT_OFFERED"
    || code === "MTM_CONTACT_SPECIALTY_NOT_OFFERED"
    || code === "MTM_CONTACT_FIELD_NOT_OFFERED"
  ) return "listChanged"
  return "failed"
}
