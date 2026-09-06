import i18next from "i18next"
import ru from "../../src/i18n/locales/ru.json"
import {
  MinimalPluralRules,
  enginePluralsWork,
  installPluralRules,
} from "../../src/i18n/plural-rules"

/**
 * B14. The dictionaries carry the Russian forms; what was missing is the engine
 * that picks between them. Node has Intl.PluralRules, so a test that only calls
 * i18next proves nothing about the phone — these tests drive the stand-in
 * directly and then run i18next against it.
 */
describe("stand-in plural rules", () => {
  it("splits Russian the way the language does, not the way English does", () => {
    const rules = new MinimalPluralRules("ru")
    expect(rules.select(1)).toBe("one")
    expect(rules.select(2)).toBe("few")
    expect(rules.select(4)).toBe("few")
    expect(rules.select(5)).toBe("many")
    expect(rules.select(0)).toBe("many")
    // The teens are the case a naive "last digit" rule gets wrong.
    expect(rules.select(11)).toBe("many")
    expect(rules.select(12)).toBe("many")
    expect(rules.select(14)).toBe("many")
    expect(rules.select(21)).toBe("one")
    expect(rules.select(22)).toBe("few")
    expect(rules.select(25)).toBe("many")
    expect(rules.select(111)).toBe("many")
    expect(rules.select(1.5)).toBe("other")
  })

  it("keeps English and Azerbaijani to their two forms", () => {
    expect(new MinimalPluralRules("en").select(1)).toBe("one")
    expect(new MinimalPluralRules("en").select(2)).toBe("other")
    expect(new MinimalPluralRules("en-US").select(21)).toBe("other")
    expect(new MinimalPluralRules("az").select(1)).toBe("one")
    expect(new MinimalPluralRules("az").select(5)).toBe("other")
  })

  it("matches the engine's own answers for every count the UI can show", () => {
    // Node has a real ICU, so it is the oracle: the stand-in must agree with it.
    for (const locale of ["ru", "en", "az"]) {
      const real = new Intl.PluralRules(locale)
      const stand = new MinimalPluralRules(locale)
      for (let n = 0; n <= 200; n += 1) {
        expect(`${locale}:${n}:${stand.select(n)}`).toBe(`${locale}:${n}:${real.select(n)}`)
      }
    }
  })
})

describe("installing it", () => {
  it("leaves a working engine alone", () => {
    expect(enginePluralsWork(Intl)).toBe(true)
    const target = { Intl }
    expect(installPluralRules(target)).toBe(false)
    expect(target.Intl.PluralRules).toBe(Intl.PluralRules)
  })

  it("detects an engine that answers English rules for every language", () => {
    class EnglishOnly {
      select(n: number) { return n === 1 ? "one" : "other" }
    }
    const fake = { PluralRules: EnglishOnly } as unknown as typeof Intl
    expect(enginePluralsWork(fake)).toBe(false)
  })

  it("detects an engine with no plural rules at all, and fills the gap", () => {
    const target = { Intl: {} as typeof Intl }
    expect(enginePluralsWork(target.Intl)).toBe(false)
    expect(installPluralRules(target)).toBe(true)
    expect(new target.Intl.PluralRules("ru").select(3)).toBe("few")
  })
})

describe("i18next against the stand-in", () => {
  it("picks the Russian form the dictionary already carries", async () => {
    const instance = i18next.createInstance()
    await instance.init({
      compatibilityJSON: "v4",
      lng: "ru",
      resources: { ru: { translation: ru as Record<string, unknown> } },
      interpolation: { escapeValue: false },
      returnNull: false,
    })
    // Real prod values from the GPS history card, the case B14 was filed for.
    expect(instance.t("gpsHistory.statPoints", { count: 1 })).toBe("1 точка")
    expect(instance.t("gpsHistory.statPoints", { count: 3 })).toBe("3 точки")
    expect(instance.t("gpsHistory.statPoints", { count: 22 })).toBe("22 точки")
    expect(instance.t("gpsHistory.statPoints", { count: 11 })).toBe("11 точек")
    expect(instance.t("gpsHistory.statPoints", { count: 0 })).toBe("0 точек")
    expect(instance.t("route.stopsCount", { count: 1 })).toBe("1 остановка")
    expect(instance.t("route.stopsCount", { count: 5 })).toBe("5 остановок")
  })
})
