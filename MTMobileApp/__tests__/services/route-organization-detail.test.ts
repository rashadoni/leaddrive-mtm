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
      // This server said nothing about the organization's pin.
      pinReported: false,
    })
  })

  // «Клиент здесь» (owner, 12 October 2026): the card measures how far the
  // agent is from the pin, and shows the pin on the correction map.
  describe("the organization's pin", () => {
    it("is carried when the server sends one", () => {
      expect(toRouteOrganizationDetail({ id: "org-1", name: "N", latitude: 40.4093, longitude: 49.8671 }))
        .toMatchObject({ latitude: 40.4093, longitude: 49.8671, pinReported: true })
    })

    it("is «none» — said by the server — for null, and never 0,0 or half a pair", () => {
      for (const raw of [
        { latitude: null, longitude: null },
        { latitude: 0, longitude: 0 },
        { latitude: 40.4, longitude: null },
        { latitude: "40.4", longitude: "49.8" },
        { latitude: 140, longitude: 49.8 },
      ]) {
        const detail = toRouteOrganizationDetail({ id: "org-1", name: "N", ...raw })
        expect(detail.latitude).toBeUndefined()
        expect(detail.longitude).toBeUndefined()
        expect(detail.pinReported).toBe(true)
      }
    })

    // «No pin» must not be read into the silence of a server that predates the fields.
    it("is not reported at all by an older server", () => {
      const detail = toRouteOrganizationDetail({ id: "org-1", name: "N" })
      expect(detail.pinReported).toBe(false)
      expect(detail.latitude).toBeUndefined()
    })
  })

  // Owner, 2026-10-02: the organization's contact data must be open to the
  // agent who visits it. The card had the phone and no one to ask for.
  it("carries the organization's contact person next to its phone", () => {
    const detail = toRouteOrganizationDetail({
      id: "org-1",
      name: "North Pharmacy",
      phone: "+994 12 000 00 00",
      contactPerson: "  Leyla Aliyeva ",
      notes: "must not survive",
    })

    expect(detail.phone).toBe("+994 12 000 00 00")
    expect(detail.contactPerson).toBe("Leyla Aliyeva")
    expect(JSON.stringify(detail)).not.toContain("must not survive")
  })

  it("leaves the contact person empty for a server that does not send it yet", () => {
    expect(toRouteOrganizationDetail({ id: "org-1", name: "North Pharmacy" }).contactPerson).toBeUndefined()
    expect(toRouteOrganizationDetail({ id: "org-1", name: "North Pharmacy", contactPerson: "   " }).contactPerson).toBeUndefined()
  })

  it("shows the contact person on the card in all three languages, filled or not", () => {
    const screen = fs.readFileSync(path.resolve(__dirname, "../../src/screens/base/RouteOrganizationDetailScreen.android.tsx"), "utf8")

    expect(screen).toContain('label={copy.contactPerson} value={detail.contactPerson ?? copy.unknown}')
    for (const label of ['contactPerson: "Контактное лицо"', 'contactPerson: "Əlaqə şəxsi"', 'contactPerson: "Contact person"']) {
      expect(screen).toContain(label)
    }
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
