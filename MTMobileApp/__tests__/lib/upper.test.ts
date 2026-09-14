import { upper, upperFirst, upperInitial, upperLocaleTag } from "../../src/lib/upper"

describe("upper (field UX audit M-08 / B13)", () => {
  it("keeps the dotted İ in Azerbaijani", () => {
    expect(upper("Bu gün üçün köməkçi", "az")).toBe("BU GÜN ÜÇÜN KÖMƏKÇİ")
    expect(upper("növbəti addım", "az")).toBe("NÖVBƏTİ ADDIM")
    expect(upper("həftənin yekunu", "az")).toBe("HƏFTƏNİN YEKUNU")
    expect(upper("sürətli keçid", "az")).toBe("SÜRƏTLİ KEÇİD")
  })

  it("upper-cases Russian and English as before", () => {
    expect(upper("помощник", "ru")).toBe("ПОМОЩНИК")
    expect(upper("next step", "en")).toBe("NEXT STEP")
  })

  it("maps bare language codes to full locale tags", () => {
    expect(upperLocaleTag("az")).toBe("az-Latn-AZ")
    expect(upperLocaleTag("az-AZ")).toBe("az-Latn-AZ")
    expect(upperLocaleTag(undefined)).toBe("en-US")
  })

  it("puts dates in sentence case, not title case", () => {
    expect(upperFirst("bazar ertəsi, 14 sentyabr", "az")).toBe("Bazar ertəsi, 14 sentyabr")
    expect(upperFirst("iyun 2026", "az")).toBe("İyun 2026")
    expect(upperFirst("понедельник, 14 сентября", "ru")).toBe("Понедельник, 14 сентября")
    expect(upperFirst("14 sentyabr 2026, bazar ertəsi", "az")).toBe("14 sentyabr 2026, bazar ertəsi")
    expect(upperFirst("", "az")).toBe("")
  })

  it("builds avatar initials in the UI language with a fallback", () => {
    expect(upperInitial("ilqar Məmmədov", "?", "az")).toBe("İ")
    expect(upperInitial("  ", "?", "az")).toBe("?")
    expect(upperInitial(null, "A", "ru")).toBe("A")
  })
})
