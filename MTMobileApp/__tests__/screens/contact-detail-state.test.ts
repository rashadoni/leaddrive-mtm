import { buildContactSnapshot, selectContactPrimaryAction } from "../../src/screens/base/contact-detail-state"
import type { ContactDetail } from "../../src/services/contact-detail"

function detail(overrides: Partial<ContactDetail> = {}): ContactDetail {
  return {
    id: "contact-1",
    updatedAt: "2026-08-20T08:00:00.000Z",
    name: "Dr Aysel",
    firstName: "Aysel",
    lastName: "Mammadova",
    workplaces: [],
    potential: null,
    changeRequests: [],
    history: [],
    doctorAssessments: [],
    brandPotentials: [],
    brandPotentialEligibleVisits: [],
    canRecordBrandPotential: false,
    canReviewBrandPotential: false,
    brandPotentialPerAgent: true,
    canManage: false,
    canRequestChanges: false,
    ...overrides,
  }
}

describe("friendly contact detail state", () => {
  it("chooses one honest primary action in a field-friendly order", () => {
    expect(selectContactPrimaryAction(detail({ mobilePhone: "+99450111", email: "a@example.az" }), true)).toEqual({ kind: "call", value: "+99450111" })
    expect(selectContactPrimaryAction(detail({ whatsappPhone: "+99450222" }), true)).toEqual({ kind: "whatsapp", value: "+99450222" })
    expect(selectContactPrimaryAction(detail({ email: "a@example.az" }), true)).toEqual({ kind: "email", value: "a@example.az" })
    expect(selectContactPrimaryAction(detail(), true)).toEqual({ kind: "edit" })
    expect(selectContactPrimaryAction(detail(), false)).toEqual({ kind: "none" })
  })

  it("prefers the active primary workplace and summarizes only active records", () => {
    const current = detail({
      workplaces: [
        { id: "w-old", customerId: "old", name: "Old clinic", isPrimary: true, endedOn: "2026-07-01" },
        { id: "w-main", customerId: "main", name: "Central clinic", isPrimary: true },
      ],
      brandPotentials: [
        { id: "b1", clientPotentialId: "b1", brandExternalId: "b1", brandName: "ACC", potentialValue: 10, coverageValue: 5, coveragePct: 50, periodStart: "2026-08-01", source: "FIELD", status: "PENDING", evidenceVisits: [] },
        { id: "b2", clientPotentialId: "b2", brandExternalId: "b2", brandName: "Ended", potentialValue: 5, coverageValue: 5, coveragePct: 100, periodStart: "2026-07-01", source: "FIELD", status: "ENDED", evidenceVisits: [] },
      ],
      doctorAssessments: [{ id: "s1", clientAssessmentId: "s1", isKol: false, actualScore: 72, periodStart: "2026-08-01", source: "FIELD", formulaVersion: "1", status: "VERIFIED" }],
      changeRequests: [{ id: "r1", kind: "CONTACT_UPDATE", status: "SUBMITTED", reason: "Fix" }],
    })

    expect(selectContactPrimaryAction(current, false)).toMatchObject({ kind: "workplace", workplace: { id: "w-main" } })
    expect(buildContactSnapshot(current)).toMatchObject({ activeWorkplaces: 1, activeBrands: 1, pendingBrands: 1, pendingChanges: 1, currentScore: 72, primaryWorkplace: { id: "w-main" }, activePotentialValue: 10, activeCoverageValue: 5, activeCoveragePct: 50 })
  })
})
