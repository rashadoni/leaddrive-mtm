import az from "../../src/i18n/locales/az.json"
import en from "../../src/i18n/locales/en.json"
import ru from "../../src/i18n/locales/ru.json"

/**
 * G2 — i18n parity for the equipment.* namespace.
 *
 * Mirrors the pattern from sku-cart-parity.test.ts.
 * Every key in equipment.* must exist in all 3 locales with the
 * same {{interpolation}} placeholders. Drift causes silent missing-key
 * bugs — the key path is rendered verbatim on screen.
 *
 * Minimum required keys for the Phase-1 MVP (list + inspect + repair):
 *   equipment.title           — screen header
 *   equipment.empty           — empty state message
 *   equipment.serialNumber    — label
 *   equipment.condition.*     — GOOD / DAMAGED / NEEDS_REPAIR / MISSING
 *   equipment.inspect.title
 *   equipment.inspect.conditionLabel
 *   equipment.inspect.notesPlaceholder
 *   equipment.inspect.submit
 *   equipment.repair.title
 *   equipment.repair.descPlaceholder
 *   equipment.repair.submit
 *   equipment.repair.successToast
 */

type LocaleJson = Record<string, unknown>

function flatKeys(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix]
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    flatKeys(v, prefix ? `${prefix}.${k}` : k)
  )
}

function placeholders(value: string): Set<string> {
  const matches = value.match(/\{\{\s*([^}]+?)\s*\}\}/g) ?? []
  return new Set(matches.map((m) => m.replace(/\{\{\s*|\s*\}\}/g, "").trim()))
}

function getPath(obj: LocaleJson, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as LocaleJson)[key]
    return undefined
  }, obj)
}

const REQUIRED_KEYS = [
  "equipment.title",
  "equipment.empty",
  "equipment.serialNumber",
  "equipment.condition.GOOD",
  "equipment.condition.DAMAGED",
  "equipment.condition.NEEDS_REPAIR",
  "equipment.condition.MISSING",
  "equipment.inspect.title",
  "equipment.inspect.conditionLabel",
  "equipment.inspect.notesPlaceholder",
  "equipment.inspect.submit",
  "equipment.repair.title",
  "equipment.repair.descPlaceholder",
  "equipment.repair.submit",
  "equipment.repair.successToast",
]

const LOCALES: Array<[string, LocaleJson]> = [
  ["az", az as unknown as LocaleJson],
  ["en", en as unknown as LocaleJson],
  ["ru", ru as unknown as LocaleJson],
]

describe("G2 — equipment.* i18n parity", () => {
  it.each(REQUIRED_KEYS)(
    'key "%s" is present and non-empty in all 3 locales',
    (key) => {
      for (const [lang, locale] of LOCALES) {
        const value = getPath(locale, key)
        if (!value) throw new Error(`${lang}.json missing or empty: "${key}"`)
        if (typeof value !== "string") throw new Error(`${lang}.json "${key}" should be string`)
        expect(value.length).toBeGreaterThan(0)
      }
    }
  )

  it("all 3 locales have identical equipment.* key sets", () => {
    const azKeys = flatKeys((az as unknown as LocaleJson)["equipment"] ?? {}, "equipment").sort()
    const enKeys = flatKeys((en as unknown as LocaleJson)["equipment"] ?? {}, "equipment").sort()
    const ruKeys = flatKeys((ru as unknown as LocaleJson)["equipment"] ?? {}, "equipment").sort()
    expect(azKeys.length).toBeGreaterThan(0)
    expect(azKeys).toEqual(enKeys)
    expect(enKeys).toEqual(ruKeys)
  })

  it("{{interpolation}} placeholders match across all locales", () => {
    const azFlat = flatKeys((az as unknown as LocaleJson)["equipment"] ?? {}, "equipment")
    for (const key of azFlat) {
      const azVal = getPath(az as unknown as LocaleJson, key) as string
      const enVal = getPath(en as unknown as LocaleJson, key) as string
      const ruVal = getPath(ru as unknown as LocaleJson, key) as string
      if (typeof azVal !== "string") continue
      const azPh = placeholders(azVal)
      if (azPh.size === 0) continue
      expect(placeholders(enVal ?? ""), `en.json "${key}" missing placeholder`).toEqual(azPh)
      expect(placeholders(ruVal ?? ""), `ru.json "${key}" missing placeholder`).toEqual(azPh)
    }
  })
})
