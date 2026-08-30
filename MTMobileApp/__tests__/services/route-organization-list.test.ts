import { toRouteOrganizationListItem } from "../../src/services/route-organization-list"

describe("Route Field organization list projection", () => {
  it("keeps route-relevant card data but drops ownership and commercial payloads", () => {
    const item = toRouteOrganizationListItem({
      id: "org-1",
      name: "North Clinic",
      objectType: "CLINIC",
      category: "A",
      address: "Baku",
      phone: "+994 12 000 00 00",
      contactsCount: "3",
      managingManager: { id: "manager-1", name: "Must not be shown" },
      agentAssignments: [{ agent: { id: "agent-2", name: "Must not be shown" } }],
      fieldPotentials: [{ potentialValue: "100" }],
    })

    expect(item).toEqual({
      id: "org-1",
      name: "North Clinic",
      objectType: "CLINIC",
      category: "A",
      address: "Baku",
      phone: "+994 12 000 00 00",
      contactsCount: 3,
    })
    expect(item).not.toHaveProperty("managingManager")
    expect(item).not.toHaveProperty("agentAssignments")
    expect(item).not.toHaveProperty("fieldPotentials")
  })
})
