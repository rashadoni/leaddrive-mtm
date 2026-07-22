import { toContactDetail } from "../../src/services/contact-detail"
import az from "../../src/i18n/locales/az.json"
import en from "../../src/i18n/locales/en.json"
import ru from "../../src/i18n/locales/ru.json"

describe("contact detail mapping", () => {
  it("flattens workplaces onto the detail shape", () => {
    const detail = toContactDetail({
      id: "k1",
      displayName: "Dr. Aliyev",
      specialtyName: "Cardiology",
      type: "DOCTOR",
      category: "A",
      status: "ACTIVE",
      phone: "+994111",
      email: "a@x.az",
      externalCode: "EXT-1",
      notes: "VIP",
      workplaces: [
        { id: "w1", isPrimary: true, jobTitle: "Head", department: "Cardiology", customer: { id: "c1", name: "Central Clinic", objectType: "CLINIC", city: "Baku" } },
        { isPrimary: false, customer: { id: "c2", name: "Second Clinic" } },
      ],
    })
    expect(detail.name).toBe("Dr. Aliyev")
    expect(detail.email).toBe("a@x.az")
    expect(detail.workplaces).toHaveLength(2)
    expect(detail.workplaces[0]).toMatchObject({ id: "w1", customerId: "c1", name: "Central Clinic", objectType: "CLINIC", city: "Baku", isPrimary: true, jobTitle: "Head", department: "Cardiology" })
    expect(detail.workplaces[1].isPrimary).toBe(false)
    expect(detail.workplaces[1].objectType).toBeUndefined()
  })

  it("maps the full personal, communication, address, review and history envelope", () => {
    const detail = toContactDetail({
      id: "k3", updatedAt: "2026-07-21T08:00:00.000Z", displayName: "Mammadov Farid",
      firstName: "Farid", lastName: "Mammadov", middleName: "Ali", birthDate: "1980-02-03T00:00:00.000Z",
      mobilePhone: "+99450", whatsappPhone: "+99450", addressRegion: "Baku", addressStreet: "Nizami 1",
      verificationStatus: "VERIFIED", consentStatus: "GRANTED", contactPreference: "WHATSAPP", source: "IMPORT",
      changeRequests: [{ id: "r1", kind: "CONTACT_UPDATE", status: "SUBMITTED", reason: "Field verified", requestedByAgent: { name: "Agent A" } }],
    }, {
      capabilities: { canManage: false, canRequestChanges: true },
      history: [{ id: "h1", action: "CONTACT_UPDATE", entity: "contact", createdAt: "2026-07-21T09:00:00.000Z", agent: { name: "Manager" } }],
    })
    expect(detail).toMatchObject({ firstName: "Farid", lastName: "Mammadov", birthDate: "1980-02-03", mobilePhone: "+99450", addressRegion: "Baku", verificationStatus: "VERIFIED", canRequestChanges: true })
    expect(detail.changeRequests[0]).toMatchObject({ id: "r1", requesterName: "Agent A" })
    expect(detail.history[0]).toMatchObject({ id: "h1", actorName: "Manager" })
  })

  it("tolerates a contact with no workplaces", () => {
    const detail = toContactDetail({ id: "k2", displayName: "Solo" })
    expect(detail.workplaces).toEqual([])
    expect(detail.phone).toBeUndefined()
  })

  describe("i18n contract", () => {
    const KEYS = ["detailInfo", "detailWorkplaces", "detailNoWorkplaces", "detailOfflineNote", "fieldType", "sectionPersonal", "requestEditTitle", "changeHistory"] as const
    it.each([["en", en], ["ru", ru], ["az", az]])(
      "contacts detail keys present in %s",
      (_lang, locale) => {
        const ns = (locale as { contacts: Record<string, unknown> }).contacts
        for (const key of KEYS) {
          expect(typeof ns[key]).toBe("string")
          expect((ns[key] as string).length).toBeGreaterThan(0)
        }
      },
    )
  })
})
