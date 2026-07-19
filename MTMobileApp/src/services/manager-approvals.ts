/**
 * Pure mapper for the Manager approvals queue (GET /mobile/manager/approvals).
 * The endpoint is read-only (no approve/reject action yet — that needs server
 * mutation endpoints), so this flattens the three pending categories (HRM
 * requests, route-change requests, new-organization requests) for a review list.
 */

export interface ApprovalItem {
  id: string
  agentName: string
  primary: string
  reason?: string
  submittedAt?: string
}

export interface ManagerApprovals {
  hrm: ApprovalItem[]
  routeChanges: ApprovalItem[]
  customers: ApprovalItem[]
  total: number
}

function str(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  const s = String(value)
  return s.length > 0 ? s : undefined
}

export function toApprovals(raw: any): ManagerApprovals {
  const hrmRaw = Array.isArray(raw?.hrm) ? (raw.hrm as any[]) : []
  const routeChangesRaw = Array.isArray(raw?.routeChanges) ? (raw.routeChanges as any[]) : []
  const customersRaw = Array.isArray(raw?.customers) ? (raw.customers as any[]) : []

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

  return { hrm, routeChanges, customers, total: hrm.length + routeChanges.length + customers.length }
}
