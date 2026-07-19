import { summarizePotential } from "../../src/services/field-potential"
import { toOrganizationDetail } from "../../src/services/organization-detail"
import { toContactDetail } from "../../src/services/contact-detail"
import az from "../../src/i18n/locales/az.json"
import en from "../../src/i18n/locales/en.json"
import ru from "../../src/i18n/locales/ru.json"

describe("field potential summary", () => {
  it("sums potential/coverage across rows and computes coverage %", () => {
    const s = summarizePotential([
      { potentialValue: "100.00", coverageValue: "40.00" },
      { potentialValue: "100", coverageValue: "35" },
    ])
    expect(s).toEqual({ potentialValue: 200, coverageValue: 75, coveragePct: 37.5, count: 2 })
  })

  it("returns 0% when potential is zero, never divides by zero", () => {
    expect(summarizePotential([{ potentialValue: 0, coverageValue: 0 }])?.coveragePct).toBe(0)
  })

  it("returns null for empty / non-array input", () => {
    expect(summarizePotential([])).toBeNull()
    expect(summarizePotential(undefined)).toBeNull()
    expect(summarizePotential(null)).toBeNull()
  })

  it("is wired into both detail mappers", () => {
    const org = toOrganizationDetail({ id: "c1", name: "X", fieldPotentials: [{ potentialValue: "50", coverageValue: "25" }] })
    expect(org.potential).toEqual({ potentialValue: 50, coverageValue: 25, coveragePct: 50, count: 1 })
    const contact = toContactDetail({ id: "k1", displayName: "Y" })
    expect(contact.potential).toBeNull()
  })

  describe("i18n contract", () => {
    const KEYS = ["title", "potential", "coverage", "percent"] as const
    it.each([["en", en], ["ru", ru], ["az", az]])(
      "potential namespace present in %s",
      (_lang, locale) => {
        const ns = (locale as { potential: Record<string, unknown> }).potential
        for (const key of KEYS) {
          expect(typeof ns[key]).toBe("string")
          expect((ns[key] as string).length).toBeGreaterThan(0)
        }
      },
    )
  })
})
