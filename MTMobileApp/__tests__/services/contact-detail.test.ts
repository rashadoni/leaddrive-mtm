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
        { isPrimary: true, position: "Head", customer: { id: "c1", name: "Central Clinic", objectType: "CLINIC", city: "Baku" } },
        { isPrimary: false, customer: { id: "c2", name: "Second Clinic" } },
      ],
    })
    expect(detail.name).toBe("Dr. Aliyev")
    expect(detail.email).toBe("a@x.az")
    expect(detail.workplaces).toHaveLength(2)
    expect(detail.workplaces[0]).toEqual({
      customerId: "c1", name: "Central Clinic", objectType: "CLINIC", city: "Baku", address: undefined, isPrimary: true, position: "Head",
    })
    expect(detail.workplaces[1].isPrimary).toBe(false)
    expect(detail.workplaces[1].objectType).toBeUndefined()
  })

  it("tolerates a contact with no workplaces", () => {
    const detail = toContactDetail({ id: "k2", displayName: "Solo" })
    expect(detail.workplaces).toEqual([])
    expect(detail.phone).toBeUndefined()
  })

  describe("i18n contract", () => {
    const KEYS = ["detailInfo", "detailWorkplaces", "detailNoWorkplaces", "detailOfflineNote", "fieldType"] as const
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
