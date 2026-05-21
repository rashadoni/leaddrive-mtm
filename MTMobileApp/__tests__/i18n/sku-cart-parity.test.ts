import az from "../../src/i18n/locales/az.json"
import en from "../../src/i18n/locales/en.json"
import ru from "../../src/i18n/locales/ru.json"

/**
 * M1-4d.fix-before-build — locale-parity audit for sku.* + cart.* namespaces.
 *
 * Mirrors the M1-1b cluster's parity guarantee: every key present in
 * one locale must be present in all three, with the same {{interpolation}}
 * placeholders. Drift causes silent missing-key bugs in production
 * (renders the key path verbatim).
 */

const LOCALES = { az, en, ru } as Record<string, Record<string, Record<string, string>>>

function keySet(locale: Record<string, Record<string, string>>, namespace: string): Set<string> {
  return new Set(Object.keys(locale[namespace] ?? {}))
}

function placeholders(value: string): Set<string> {
  // Matches {{x}}, {{ name }}, {{n}} — anything inside double-braces.
  const matches = value.match(/\{\{\s*([^}]+?)\s*\}\}/g) ?? []
  return new Set(matches.map((m) => m.replace(/\{\{\s*|\s*\}\}/g, "")))
}

describe("Locale parity — sku.* (M1-4d.audit)", () => {
  it("all three locales declare the same sku.* keys", () => {
    const azKeys = keySet(az, "sku")
    const enKeys = keySet(en, "sku")
    const ruKeys = keySet(ru, "sku")
    expect(azKeys.size).toBeGreaterThan(0)
    expect(azKeys).toEqual(enKeys)
    expect(enKeys).toEqual(ruKeys)
  })
})

describe("Locale parity — cart.* (M1-4d.audit)", () => {
  it("all three locales declare the same cart.* keys", () => {
    const azKeys = keySet(az, "cart")
    const enKeys = keySet(en, "cart")
    const ruKeys = keySet(ru, "cart")
    expect(azKeys.size).toBeGreaterThan(0)
    expect(azKeys).toEqual(enKeys)
    expect(enKeys).toEqual(ruKeys)
  })

  it("{{interpolation}} placeholders agree across locales for every cart key", () => {
    // Architect M1-1b precedent: drift in placeholders (e.g. one locale
    // uses {{name}}, another {{Name}}, third forgets it entirely) results
    // in unrendered braces or missing interpolations at runtime.
    //
    // Cast each locale's `cart` namespace to a string-record so dynamic
    // indexing with `key` doesn't trip TS7053 (implicit-any). Jest's
    // babel transform was permissive but `npx tsc --noEmit` was not.
    const enCart = en.cart as Record<string, string>
    const azCart = az.cart as Record<string, string>
    const ruCart = ru.cart as Record<string, string>
    for (const key of Object.keys(enCart)) {
      const enPh = placeholders(enCart[key])
      const azPh = placeholders(azCart[key])
      const ruPh = placeholders(ruCart[key])
      expect(azPh).toEqual(enPh)
      expect(ruPh).toEqual(enPh)
    }
  })
})
