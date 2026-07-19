import { toContactListItem } from "../../src/services/contact-list"
import az from "../../src/i18n/locales/az.json"
import en from "../../src/i18n/locales/en.json"
import ru from "../../src/i18n/locales/ru.json"

describe("contact list mapping", () => {
  it("maps a GET /contacts row and picks the primary workplace name", () => {
    const item = toContactListItem({
      id: "k1",
      displayName: "Dr. Aliyev",
      specialtyName: "Cardiology",
      type: "DOCTOR",
      category: "A",
      phone: "+994501112233",
      workplaces: [
        { customer: { id: "c1", name: "Central Clinic" } },
        { customer: { id: "c2", name: "Second Clinic" } },
      ],
    })
    expect(item).toEqual({
      id: "k1",
      name: "Dr. Aliyev",
      specialty: "Cardiology",
      type: "DOCTOR",
      category: "A",
      phone: "+994501112233",
      workplace: "Central Clinic",
    })
  })

  it("tolerates missing optional fields and no workplaces", () => {
    const item = toContactListItem({ id: "k2", displayName: "Nurse" })
    expect(item.name).toBe("Nurse")
    expect(item.specialty).toBeUndefined()
    expect(item.type).toBeUndefined()
    expect(item.phone).toBeUndefined()
    expect(item.workplace).toBeUndefined()
  })

  it("omits an empty workplace name", () => {
    const item = toContactListItem({ id: "k3", displayName: "X", workplaces: [{ customer: { id: "c", name: "" } }] })
    expect(item.workplace).toBeUndefined()
  })

  describe("i18n contract", () => {
    const KEYS = ["title", "searchPlaceholder", "empty", "emptySearch", "offlineUnavailable", "typeDoctor"] as const
    it.each([["en", en], ["ru", ru], ["az", az]])(
      "contacts namespace present in %s",
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
