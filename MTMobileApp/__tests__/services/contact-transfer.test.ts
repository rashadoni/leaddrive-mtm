import {
  makeContactTransferIdempotencyKey,
  toContactTransferPreview,
  toTransferAgents,
} from "../../src/services/contact-transfer"

describe("contact transfer service", () => {
  it("keeps only field agents and sorts active recipients before inactive sources", () => {
    expect(toTransferAgents({ agents: [
      { id: "manager", name: "Manager", role: "MANAGER", status: "ACTIVE" },
      { id: "inactive", name: "Zaur", role: "AGENT", status: "INACTIVE" },
      { id: "active", name: "Aysel", role: "AGENT", status: "ACTIVE" },
    ] })).toEqual([
      { id: "active", name: "Aysel", role: "AGENT", status: "ACTIVE" },
      { id: "inactive", name: "Zaur", role: "AGENT", status: "INACTIVE" },
    ])
  })

  it("normalizes preview counts and conflict rows without inventing eligibility", () => {
    expect(toContactTransferPreview({
      previewToken: "a".repeat(64),
      effectiveFrom: "2026-07-22",
      summary: { selected: 2, transferable: 1, excluded: 1, openVisitConflicts: 1, routePlanConflicts: 0 },
      rows: [
        { contactId: "c1", displayName: "Doctor One", transferable: true, issues: [] },
        { contactId: "c2", displayName: "Doctor Two", transferable: false, issues: ["OPEN_VISIT_CONFLICT"], openVisitCount: 1 },
      ],
    })).toMatchObject({
      summary: { selected: 2, transferable: 1, excluded: 1 },
      rows: [
        { contactId: "c1", transferable: true, openVisitCount: 0 },
        { contactId: "c2", transferable: false, issues: ["OPEN_VISIT_CONFLICT"], openVisitCount: 1 },
      ],
    })
  })

  it("creates a stable non-secret idempotency key shape", () => {
    expect(makeContactTransferIdempotencyKey(1234, 0.5)).toBe("contact-transfer-1234-89oqgw")
  })
})
