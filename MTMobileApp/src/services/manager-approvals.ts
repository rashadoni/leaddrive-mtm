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
