import {
  makeOrganizationAssignmentIdempotencyKey,
  normalizeFacets,
  toExplorerOrganization,
} from "../../src/services/organization-explorer"

describe("organization explorer read models", () => {
  it("keeps SwissMed geography, manager and active assignment context", () => {
    expect(toExplorerOrganization({
      id: "org-1",
      name: "Central Clinic",
      region: "Baku",
      administrativeDistrict: "Nasimi",
      locality: "Baku",
      cityDistrict: "28 May",
      territoryCode: "BAKU-C1",
      managingManager: { id: "manager-1", name: "Farid" },
      agentAssignments: [{ agent: { id: "agent-1", name: "Tural" } }],
      _count: { contactWorkplaces: 12, visits: 4 },
    })).toMatchObject({
      region: "Baku",
      administrativeDistrict: "Nasimi",
      locality: "Baku",
      cityDistrict: "28 May",
      territoryCode: "BAKU-C1",
      managingManager: { name: "Farid" },
      assignedAgents: [{ name: "Tural" }],
      contactsCount: 12,
      visitsCount: 4,
    })
  })

  it("normalizes only valid facet arrays and creates retry keys", () => {
    expect(normalizeFacets({ region: ["Baku", null], managers: [{ id: "m1", name: "Farid" }] })).toMatchObject({
      region: ["Baku"],
      administrativeDistrict: [],
      managers: [{ id: "m1", name: "Farid" }],
    })
    expect(makeOrganizationAssignmentIdempotencyKey()).toMatch(/^org-assignment-\d+-[a-z0-9]+$/)
  })
})
