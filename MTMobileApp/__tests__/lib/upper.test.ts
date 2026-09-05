import { upper, upperInitial, upperLocaleTag } from "../../src/lib/upper"

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

  it("builds avatar initials in the UI language with a fallback", () => {
    expect(upperInitial("ilqar Məmmədov", "?", "az")).toBe("İ")
    expect(upperInitial("  ", "?", "az")).toBe("?")
    expect(upperInitial(null, "A", "ru")).toBe("A")
  })
})
