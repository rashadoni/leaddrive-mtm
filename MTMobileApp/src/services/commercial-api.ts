import { api } from "./api"

/**
 * Legacy commercial and full-contact facade.
 *
 * These preserved v1 contracts remain available to the inactive commercial
 * shell, but are excluded from the active Route Field Android import graph.
 * Server authorization, idempotency handling and approval rules remain
 * authoritative; this move changes neither URLs nor payloads.
 */
export const commercialApi = {
  getContacts(
    params?: { search?: string; page?: number; limit?: number; ownerAgentId?: string },
    signal?: AbortSignal,
  ) {
    const query = new URLSearchParams()
    if (params?.search) query.set("search", params.search)
    if (params?.page) query.set("page", String(params.page))
    if (params?.limit) query.set("limit", String(params.limit))
    if (params?.ownerAgentId) query.set("ownerAgentId", params.ownerAgentId)
    const qs = query.toString()
    return api.requestLegacy(`/contacts${qs ? `?${qs}` : ""}`, { signal })
  },

  getContact(id: string, signal?: AbortSignal) {
    return api.requestLegacy(`/contacts/${id}`, { signal })
  },

  updateContact(id: string, fields: Record<string, unknown>) {
    return api.requestLegacy(`/contacts/${id}`, { method: "PUT", body: JSON.stringify(fields) })
  },

  submitContactChange(id: string, data: {
    idempotencyKey: string
    reason: string
    expectedContactUpdatedAt: string
    kind: "CONTACT_UPDATE" | "WORKPLACE_UPSERT" | "WORKPLACE_END" | "DUPLICATE_REPORT"
    payload: object
  }) {
    return api.requestLegacy(`/contacts/${id}/change-requests`, { method: "POST", body: JSON.stringify(data) })
  },

  upsertContactWorkplace(id: string, data: object) {
    return api.requestLegacy(`/contacts/${id}/workplaces`, { method: "PUT", body: JSON.stringify(data) })
  },

  endContactWorkplace(id: string, workplaceId: string) {
    return api.requestLegacy(`/contacts/${id}/workplaces/${workplaceId}`, { method: "DELETE" })
  },

  getDoctorScoringFormulas(signal?: AbortSignal) {
    return api.requestLegacy("/doctor-scoring/formulas", { signal })
  },

  createDoctorAssessment(contactId: string, data: object) {
    return api.requestLegacy(`/contacts/${contactId}/assessments`, {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  decideDoctorAssessment(id: string, decision: "VERIFIED" | "REJECTED", comment: string) {
    return api.requestLegacy(`/doctor-assessments/${id}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision, comment }),
    })
  },

  createBrandPotential(contactId: string, data: object) {
    return api.requestLegacy(`/contacts/${contactId}/brand-potentials`, {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  decideBrandPotential(id: string, decision: "VERIFIED" | "REJECTED", comment: string) {
    return api.requestLegacy(`/field-potentials/${id}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision, comment }),
    })
  },

  endBrandPotential(id: string, periodEnd: string, reason: string) {
    return api.requestLegacy(`/field-potentials/${id}/end`, {
      method: "POST",
      body: JSON.stringify({ periodEnd, reason }),
    })
  },
}
