import fs from "fs"
import path from "path"
import { toRouteOrganizationDetail } from "../../src/services/route-organization-detail"

describe("Route Field organization detail projection", () => {
  it("keeps only the fixed v2 detail DTO and drops injected manager or commercial data", () => {
    const detail = toRouteOrganizationDetail({
      id: "org-1",
      name: "North Clinic",
      objectType: "CLINIC",
      address: "Baku",
      contacts: [{
        id: "contact-1",
        name: "Dr. Farid",
        specialty: "Cardiology",
        type: "DOCTOR",
        phone: "+994 12 111 11 11",
        isPrimary: true,
        position: "Doctor",
        workPhone: "must not survive",
      }],
      visits: [{
        id: "visit-1",
        status: "CHECKED_OUT",
        checkInAt: "2026-08-29T10:00:00.000Z",
        outcome: "SUCCESSFUL",
        agentId: "must not survive",
      }],
      managingManager: { name: "must not survive" },
      agentAssignments: [{ agentId: "must not survive" }],
      fieldPotentials: [{ potentialValue: "100" }],
      commercial: { revenue: "1000" },
    })

    expect(detail).toEqual({
      id: "org-1",
      name: "North Clinic",
      objectType: "CLINIC",
      address: "Baku",
      contacts: [{
        id: "contact-1",
        name: "Dr. Farid",
        specialty: "Cardiology",
        type: "DOCTOR",
        phone: "+994 12 111 11 11",
        isPrimary: true,
        position: "Doctor",
      }],
      visits: [{
        id: "visit-1",
        status: "CHECKED_OUT",
        checkInAt: "2026-08-29T10:00:00.000Z",
        outcome: "SUCCESSFUL",
      }],
    })
  })

  it("calls the dedicated v2 mobile endpoint instead of a broad v1 detail", () => {
    const apiSource = fs.readFileSync(path.resolve(__dirname, "../../src/services/api.ts"), "utf8")
    const routeMethod = apiSource.slice(apiSource.indexOf("async getRouteOrganizationDetail"), apiSource.indexOf("async getContacts"))

    expect(routeMethod).toContain("/mobile/route-field/organizations/")
    expect(routeMethod).toContain("20_000, 2")
    expect(routeMethod).not.toContain("?section=")
    expect(routeMethod).not.toContain("getOrganization(id")
  })
})
