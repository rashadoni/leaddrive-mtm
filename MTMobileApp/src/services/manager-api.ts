import { api } from "./api"

/**
 * Legacy manager/team transport facade.
 *
 * This isolates legacy endpoint literals from the Route Field core client.
 * The self-planner/navigation split removes this facade from the active Route
 * Field import graph in the following checkpoint. The server remains
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
