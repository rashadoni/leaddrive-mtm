import { planningTargetForDate } from "../../src/services/manager-planning"
import { toRoutePlanningTarget } from "../../src/services/route-planning-target"

describe("Route Field planning target projection", () => {
  it("maps only the fixed v2 fields and binds every target to the server-evaluated date", () => {
    const organization = toRoutePlanningTarget({
      kind: "organization",
      customerId: "customer-1",
      name: "North Clinic",
      address: "Baku",
      phone: "+994 must-not-project",
      latitude: 40.4,
      managingManager: { name: "Must not project" },
    }, "2026-08-30")
    const contact = toRoutePlanningTarget({
      kind: "contact",
      contactId: "contact-1",
      customerId: "customer-1",
      name: "Dr. Farid",
      organizationName: "North Clinic",
      address: "Baku",
      email: "must-not-project@example.test",
      phone: "+994 must-not-project",
      workplaces: [{ customerId: "other" }],
    }, "2026-08-30")

    expect(organization).toEqual({
      key: "organization:customer-1",
      kind: "organization",
      customerId: "customer-1",
      name: "North Clinic",
      address: "Baku",
      eligible: true,
      validOnDate: "2026-08-30",
    })
    expect(contact).toEqual({
      key: "contact:contact-1",
      kind: "contact",
      customerId: "customer-1",
      contactId: "contact-1",
      name: "Dr. Farid",
      organizationName: "North Clinic",
      address: "Baku",
      eligible: true,
      contactStatus: "ACTIVE",
      validOnDate: "2026-08-30",
    })
    expect(JSON.stringify({ organization, contact })).not.toContain("must-not-project")
    expect(JSON.stringify({ organization, contact })).not.toContain("Must not project")
    expect(planningTargetForDate(organization!, "2026-08-30")).not.toBeNull()
    expect(planningTargetForDate(organization!, "2026-08-31")).toBeNull()
    expect(planningTargetForDate(contact!, "2026-08-31")).toBeNull()
  })

  it("rejects malformed, broad-catalog and incomplete payloads", () => {
    expect(toRoutePlanningTarget({ id: "legacy-org", name: "Legacy" }, "2026-08-30")).toBeNull()
    expect(toRoutePlanningTarget({ kind: "organization", customerId: "customer-1" }, "2026/08/30")).toBeNull()
    expect(toRoutePlanningTarget({ kind: "contact", customerId: "customer-1" }, "2026-08-30")).toBeNull()
    expect(toRoutePlanningTarget({ kind: "other", customerId: "customer-1" }, "2026-08-30")).toBeNull()
  })
})
