import { api } from "./api"

/**
 * Legacy manager/team transport facade.
 *
 * This isolates legacy endpoint literals from the Route Field core client and
 * is excluded from the active Route Field import graph. The server remains
 * authoritative for TEAM_READ/TEAM_DECIDE and HRM permissions; moving these
 * wrappers changes no URL, body, auth header or RLS contract.
 */
export const managerApi = {
  getTeam(signal?: AbortSignal, includeInactive = false) {
    return api.requestLegacy(`/mobile/manager/team${includeInactive ? "?includeInactive=1" : ""}`, { signal })
  },

  getLocations(signal?: AbortSignal) {
    return api.requestLegacy("/mobile/manager/locations", { signal })
  },

  getPlanning(date?: string, signal?: AbortSignal) {
    const qs = date ? `?date=${encodeURIComponent(date)}` : ""
    return api.requestLegacy(`/mobile/manager/planning${qs}`, { signal })
  },

  getPlanningRange(from: string, to: string, signal?: AbortSignal) {
    const query = new URLSearchParams({ from, to })
    return api.requestLegacy(`/mobile/manager/planning?${query.toString()}`, { signal })
  },

  getApprovals(signal?: AbortSignal) {
    return api.requestLegacy("/mobile/manager/approvals", { signal })
  },

  /**
   * Legacy manager catalog. Route Field never sends team-assignment filters;
   * server-side RLS remains authoritative for every returned organization.
   */
  getOrganizations(
    params?: {
      search?: string
      page?: number
      limit?: number
      category?: string
      status?: string
      objectType?: string
      region?: string
      administrativeDistrict?: string
      locality?: string
      cityDistrict?: string
      specialization?: string
      organizationKind?: string
      territoryCode?: string
      managingManagerId?: string
      assignedAgentId?: string
      assignmentState?: "ASSIGNED" | "UNASSIGNED"
      sort?: "name" | "updatedAt" | "city" | "category" | "status"
      direction?: "asc" | "desc"
    },
    signal?: AbortSignal,
  ) {
    const query = new URLSearchParams()
    if (params?.search) query.set("search", params.search)
    if (params?.page) query.set("page", String(params.page))
    if (params?.limit) query.set("limit", String(params.limit))
    for (const key of [
      "category", "status", "objectType", "region", "administrativeDistrict",
      "locality", "cityDistrict", "specialization", "organizationKind",
      "territoryCode", "managingManagerId", "assignedAgentId", "assignmentState",
      "sort", "direction",
    ] as const) {
      if (params?.[key]) query.set(key, params[key] as string)
    }
    const qs = query.toString()
    return api.requestLegacy(`/organizations${qs ? `?${qs}` : ""}`, { signal })
  },

  getOrganization(id: string, signal?: AbortSignal) {
    return api.requestLegacy(`/organizations/${id}`, { signal })
  },

  getOrganizationFacets(signal?: AbortSignal) {
    return api.requestLegacy("/organizations/facets", { signal })
  },

  getOrganizationViews(signal?: AbortSignal) {
    return api.requestLegacy("/organizations/views", { signal })
  },

  createOrganizationView(data: {
    name: string
    filters: Record<string, unknown>
    columns: string[]
    isDefault?: boolean
  }) {
    return api.requestLegacy("/organizations/views", { method: "POST", body: JSON.stringify(data) })
  },

  deleteOrganizationView(id: string) {
    return api.requestLegacy(`/organizations/views/${id}`, { method: "DELETE" })
  },

  previewOrganizationAssignment(data: {
    organizationIds: string[]
    mode: "ASSIGN" | "UNASSIGN"
    targetAgentId?: string | null
    effectiveFrom: string
    reason: string
  }) {
    return api.requestLegacy("/organization-assignments/preview", { method: "POST", body: JSON.stringify(data) })
  },

  executeOrganizationAssignment(data: {
    organizationIds: string[]
    mode: "ASSIGN" | "UNASSIGN"
    targetAgentId?: string | null
    effectiveFrom: string
    reason: string
    previewToken: string
    idempotencyKey: string
  }) {
    return api.requestLegacy("/organization-assignments", { method: "POST", body: JSON.stringify(data) })
  },

  /**
   * Drafts of the team's routes from `start` on (GET /routes, mobile token
   * allowed; the server scopes them to the manager's team). One page of the
   * nearest 200 is the queue: a draft further out than that is not today's.
   */
  getRouteDrafts(start: string, endExclusive: string, signal?: AbortSignal) {
    const query = new URLSearchParams({ status: "DRAFT", start, endExclusive, limit: "200" })
    return api.requestLegacy(`/routes?${query.toString()}`, { signal })
  },

  /** Publish an agent's draft; a stale `expectedVersion` is refused with 409 ROUTE_VERSION_CONFLICT. */
  publishRouteDraft(id: string, expectedVersion: number) {
    return api.requestLegacy(`/routes/${encodeURIComponent(id)}/publish`, {
      method: "POST",
      body: JSON.stringify({ expectedVersion }),
    })
  },

  /** The team's open requests for a new doctor (SUBMITTED, IN_REVIEW, NEEDS_INFO), oldest first. */
  getContactCreateRequests(signal?: AbortSignal) {
    return api.requestLegacy("/contact-create-requests", { signal })
  },

  /** Approve (creates the doctor, refused with 409 MTM_CONTACT_CREATE_DUPLICATE) or reject a request. */
  contactCreateDecision(id: string, decision: "APPROVED" | "REJECTED", comment?: string) {
    return api.requestLegacy(`/contact-create-requests/${encodeURIComponent(id)}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision, ...(comment ? { comment } : {}) }),
    })
  },

  hrmDecision(id: string, decision: "APPROVED" | "REJECTED", note?: string) {
    return api.requestLegacy(`/operations/hrm/${id}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision, ...(note ? { note } : {}) }),
    })
  },

  routeChangeDecision(id: string, decision: "APPROVED" | "REJECTED", comment?: string) {
    return api.requestLegacy(`/route-change-requests/${id}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision, ...(comment ? { comment } : {}) }),
    })
  },

  customerCreateDecision(id: string, decision: "APPROVED" | "REJECTED", comment?: string) {
    return api.requestLegacy(`/customer-create-requests/${id}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision, ...(comment ? { comment } : {}) }),
    })
  },

  contactChangeDecision(id: string, decision: "APPROVED" | "REJECTED", comment: string) {
    return api.requestLegacy(`/contact-change-requests/${id}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision, comment }),
    })
  },

  bulkReassignTasks(taskIds: string[], agentId: string) {
    return api.requestLegacy("/mobile/tasks/bulk-reassign", {
      method: "POST",
      body: JSON.stringify({ taskIds, agentId }),
    })
  },

  updateTaskFields(
    id: string,
    fields: {
      title?: string
      description?: string | null
      priority?: string
      dueDate?: string | null
      recurrenceRule?: string | null
      recurrenceInterval?: number
    },
  ) {
    return api.requestLegacy(`/mobile/tasks/${id}`, {
      method: "PUT",
      body: JSON.stringify(fields),
    })
  },

  duplicateTask(id: string) {
    return api.requestLegacy(`/mobile/tasks/${id}/duplicate`, { method: "POST" })
  },

  returnTask(id: string, reason: string) {
    return api.requestLegacy(`/mobile/tasks/${id}/return`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    })
  },

  previewContactTransfer(data: {
    contactIds: string[]
    sourceAgentId: string
    targetAgentId: string
    effectiveFrom: string
  }) {
    return api.requestLegacy("/contact-transfers/preview", {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  executeContactTransfer(data: {
    contactIds: string[]
    sourceAgentId: string
    targetAgentId: string
    effectiveFrom: string
    previewToken: string
    idempotencyKey: string
    reason: string
  }) {
    return api.requestLegacy("/contact-transfers", {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  /** Optional, server-gated colleague calendar; callers must not persist it. */
  getTeamSchedule(from: string, to: string, signal?: AbortSignal) {
    const query = new URLSearchParams({ from, to })
    return api.requestLegacy(`/mobile/team-schedule?${query.toString()}`, { signal })
  },

  /**
   * Explicit manager foreground sharing. The SELF_SHARE server mode is kept
   * separate from the Route Field foreground GPS stream.
   */
  shareSelfLocation(data: {
    latitude: number
    longitude: number
    accuracy?: number
    speed?: number
    heading?: number
    altitude?: number
    battery?: number
  }) {
    return api.requestLegacy("/mobile/location", {
      method: "POST",
      body: JSON.stringify({ ...data, mode: "SELF_SHARE" }),
    })
  },
}
