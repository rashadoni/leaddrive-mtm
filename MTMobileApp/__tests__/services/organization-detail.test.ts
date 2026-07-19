import { toOrganizationDetail } from "../../src/services/organization-detail"
import az from "../../src/i18n/locales/az.json"
import en from "../../src/i18n/locales/en.json"
import ru from "../../src/i18n/locales/ru.json"

describe("organization detail mapping", () => {
  it("flattens contactWorkplaces and visits onto the detail shape", () => {
    const detail = toOrganizationDetail({
      id: "c1",
      name: "Central Clinic",
      code: "CL-1",
      objectType: "CLINIC",
      category: "A",
      status: "ACTIVE",
      address: "Nizami 12",
      city: "Baku",
      district: "Yasamal",
      phone: "+994100",
      contactPerson: "Ms. R",
      notes: "VIP",
      contactWorkplaces: [
        { isPrimary: true, position: "Head", contact: { id: "k1", displayName: "Dr. A", specialtyName: "Cardio", type: "DOCTOR", phone: "+994111" } },
        { isPrimary: false, contact: { id: "k2", displayName: "Dr. B", type: "DOCTOR" } },
      ],
      visits: [
        { id: "v1", status: "CHECKED_OUT", checkInAt: "2026-07-18T09:00:00.000Z", outcome: "SUCCESSFUL", agent: { id: "a1", name: "Agent One" } },
      ],
    })

    expect(detail.name).toBe("Central Clinic")
    expect(detail.district).toBe("Yasamal")
    expect(detail.contacts).toHaveLength(2)
    expect(detail.contacts[0]).toEqual({
      id: "k1", name: "Dr. A", specialty: "Cardio", type: "DOCTOR", phone: "+994111", isPrimary: true, position: "Head",
    })
    expect(detail.contacts[1].isPrimary).toBe(false)
    expect(detail.contacts[1].specialty).toBeUndefined()
    expect(detail.visits[0]).toEqual({
      id: "v1", status: "CHECKED_OUT", checkInAt: "2026-07-18T09:00:00.000Z", outcome: "SUCCESSFUL", agentName: "Agent One",
    })
  })

  it("tolerates missing contactWorkplaces/visits arrays", () => {
    const detail = toOrganizationDetail({ id: "c2", name: "Solo" })
    expect(detail.contacts).toEqual([])
    expect(detail.visits).toEqual([])
    expect(detail.phone).toBeUndefined()
  })

  describe("i18n contract", () => {
    const KEYS = ["detailRequisites", "detailVisits", "detailNoContacts", "detailOfflineNote", "fieldCode"] as const
    it.each([["en", en], ["ru", ru], ["az", az]])(
      "organizations detail keys present in %s",
      (_lang, locale) => {
        const ns = (locale as { organizations: Record<string, unknown> }).organizations
        for (const key of KEYS) {
          expect(typeof ns[key]).toBe("string")
          expect((ns[key] as string).length).toBeGreaterThan(0)
        }
      },
    )
  })
})
