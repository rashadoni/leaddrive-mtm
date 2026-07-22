export interface TransferAgent {
  id: string
  name: string
  role: string
  status: string
}

export type ContactTransferIssue =
  | "CONTACT_NOT_AVAILABLE"
  | "CONTACT_INACTIVE"
  | "SOURCE_AGENT_UNAVAILABLE"
  | "TARGET_AGENT_UNAVAILABLE"
  | "SAME_AGENT"
  | "OWNER_CHANGED"
  | "MULTIPLE_PRIMARY_OWNERS"
  | "TARGET_ALREADY_ASSIGNED"
  | "FUTURE_ASSIGNMENT_CONFLICT"
  | "OPEN_VISIT_CONFLICT"
  | "ROUTE_PLAN_CONFLICT"

export interface ContactTransferPreviewRow {
  contactId: string
  displayName: string | null
  issues: ContactTransferIssue[]
  transferable: boolean
  openVisitCount: number
  plannedRouteCount: number
}

export interface ContactTransferPreview {
  previewToken: string
  effectiveFrom: string
  sourceAgent: TransferAgent | null
  targetAgent: TransferAgent | null
  warnings: string[]
  summary: {
    selected: number
    transferable: number
    excluded: number
    openVisitConflicts: number
    routePlanConflicts: number
  }
  rows: ContactTransferPreviewRow[]
}

export function toTransferAgents(raw: unknown): TransferAgent[] {
  const agents = Array.isArray((raw as any)?.agents) ? (raw as any).agents : []
  return agents
    .filter((agent: any) => agent?.role === "AGENT" && typeof agent?.id === "string")
    .map((agent: any) => ({
      id: agent.id,
      name: String(agent.name ?? ""),
      role: String(agent.role),
      status: String(agent.status ?? "INACTIVE"),
    }))
    .sort((a: TransferAgent, b: TransferAgent) => {
      if (a.status === b.status) return a.name.localeCompare(b.name)
      return a.status === "ACTIVE" ? -1 : 1
    })
}

export function toContactTransferPreview(raw: any): ContactTransferPreview {
  const rows = Array.isArray(raw?.rows) ? raw.rows : []
  return {
    previewToken: String(raw?.previewToken ?? ""),
    effectiveFrom: String(raw?.effectiveFrom ?? ""),
    sourceAgent: raw?.sourceAgent ?? null,
    targetAgent: raw?.targetAgent ?? null,
    warnings: Array.isArray(raw?.warnings) ? raw.warnings.map(String) : [],
    summary: {
      selected: Number(raw?.summary?.selected ?? 0),
      transferable: Number(raw?.summary?.transferable ?? 0),
      excluded: Number(raw?.summary?.excluded ?? 0),
      openVisitConflicts: Number(raw?.summary?.openVisitConflicts ?? 0),
      routePlanConflicts: Number(raw?.summary?.routePlanConflicts ?? 0),
    },
    rows: rows.map((row: any) => ({
      contactId: String(row?.contactId ?? ""),
      displayName: row?.displayName == null ? null : String(row.displayName),
      issues: Array.isArray(row?.issues) ? row.issues.map(String) as ContactTransferIssue[] : [],
      transferable: row?.transferable === true,
      openVisitCount: Number(row?.openVisitCount ?? 0),
      plannedRouteCount: Number(row?.plannedRouteCount ?? 0),
    })),
  }
}

export function makeContactTransferIdempotencyKey(now = Date.now(), random = Math.random()): string {
  return `contact-transfer-${now}-${Math.floor(random * 1_000_000_000).toString(36)}`
}
