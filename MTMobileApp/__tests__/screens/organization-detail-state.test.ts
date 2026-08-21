import {
  disclosedOrganizationItems,
  organizationDetailViewState,
  recentOrganizationVisits,
  selectOrganizationPrimaryAction,
  usableOrganizationRecordId,
} from "../../src/screens/base/organization-detail-state"

describe("friendly organization detail state", () => {
  it("distinguishes loading, retained stale data and a blocking error", () => {
    expect(organizationDetailViewState({ loading: true, hasDetail: false, loadFailed: false })).toBe("loading")
    expect(organizationDetailViewState({ loading: false, hasDetail: true, loadFailed: true })).toBe("stale")
    expect(organizationDetailViewState({ loading: false, hasDetail: false, loadFailed: true })).toBe("error")
    expect(organizationDetailViewState({ loading: false, hasDetail: true, loadFailed: false })).toBe("ready")
  })

  it("chooses one real next action in field-work order", () => {
    expect(selectOrganizationPrimaryAction({ hasAddress: true, phone: "+994", contactId: "c1", visitId: "v1" })).toBe("directions")
    expect(selectOrganizationPrimaryAction({ hasAddress: false, phone: "+994", contactId: "c1", visitId: "v1" })).toBe("call")
    expect(selectOrganizationPrimaryAction({ hasAddress: false, contactId: "c1", visitId: "v1" })).toBe("contact")
    expect(selectOrganizationPrimaryAction({ hasAddress: false, visitId: "v1" })).toBe("visit")
    expect(selectOrganizationPrimaryAction({ hasAddress: false })).toBe("none")
  })

  it("rejects placeholder ids before enabling navigation", () => {
    expect(usableOrganizationRecordId("contact-1")).toBe(true)
    expect(usableOrganizationRecordId("undefined")).toBe(false)
    expect(usableOrganizationRecordId(" null ")).toBe(false)
    expect(usableOrganizationRecordId("")).toBe(false)
  })

  it("orders visits newest first and discloses long lists progressively", () => {
    const visits = recentOrganizationVisits([
      { id: "old", checkInAt: "2026-08-18T09:00:00.000Z" },
      { id: "unknown" },
      { id: "new", checkInAt: "2026-08-20T09:00:00.000Z" },
    ])

    expect(visits.map((visit) => visit.id)).toEqual(["new", "old", "unknown"])
    expect(disclosedOrganizationItems(visits, false, 2).map((visit) => visit.id)).toEqual(["new", "old"])
    expect(disclosedOrganizationItems(visits, true, 2)).toHaveLength(3)
  })
})
