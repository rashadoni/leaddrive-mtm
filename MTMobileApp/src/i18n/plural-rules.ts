/**
 * Cardinal plural rules for the three UI languages, installed only when the
 * engine has none (field UX audit, task B14).
 *
 * i18next runs in `compatibilityJSON: "v4"` mode, which asks
 * `Intl.PluralRules` which of `_one / _few / _many / _other` to use. Node has
 * that API, so jest is green either way; Hermes is built with a trimmed ICU and
 * historically ships without it, and when the constructor is missing i18next
 * silently falls back to a single form. The dictionaries carry the correct
 * Russian forms, and the phone would still have shown "1 точек".
 *
 * Rather than guess what a given Hermes build includes, this probes the engine
 * with a case that separates a working implementation from a missing or
 * English-only one, and installs a replacement only if that probe fails. On an
 * engine that already pluralises Russian correctly nothing here runs.
 *
 * Rules are the CLDR cardinal rules for these locales, no more:
 *   az — one when n is exactly 1, otherwise other
 *   en — one when the value is the integer 1, otherwise other
 *   ru — the 1 / 2-4 / 0,5-9,11-14 split, fractions always other
 */

type Category = "one" | "few" | "many" | "other"

function selectAz(n: number): Category {
  return n === 1 ? "one" : "other"
}

function selectEn(n: number): Category {
  return Number.isInteger(n) && n === 1 ? "one" : "other"
}

function selectRu(n: number): Category {
  // A fraction is always "other" in Russian: 1,5 точки reads as "other".
  if (!Number.isInteger(n)) return "other"
  const i = Math.abs(n)
  const mod10 = i % 10
  const mod100 = i % 100
  if (mod10 === 1 && mod100 !== 11) return "one"
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "few"
  return "many"
}

const SELECTORS: Record<string, (n: number) => Category> = {
  az: selectAz,
  en: selectEn,
  ru: selectRu,
}

/** Base language of a tag such as "ru-RU"; unknown languages fall back to English. */
function selectorFor(locale: string | undefined): (n: number) => Category {
  const base = String(locale ?? "en").split("-")[0].toLowerCase()
  return SELECTORS[base] ?? selectEn
}

/**
 * True when the engine's own `Intl.PluralRules` answers a Russian case that a
 * missing or English-only implementation gets wrong. Two probes, because an
 * engine that returns "other" for everything would pass a one-value check.
 */
export function enginePluralsWork(intl: typeof Intl = Intl): boolean {
  const ctor = (intl as { PluralRules?: unknown }).PluralRules
  if (typeof ctor !== "function") return false
  try {
    const ru = new (ctor as typeof Intl.PluralRules)("ru")
    return ru.select(2) === "few" && ru.select(5) === "many"
  } catch {
    return false
  }
}

/** Minimal stand-in: only `select`, which is all i18next calls. */
export class MinimalPluralRules {
  private readonly select_: (n: number) => Category
  private readonly locale: string

  constructor(locales?: string | string[], _options?: Intl.PluralRulesOptions) {
    this.locale = Array.isArray(locales) ? locales[0] ?? "en" : locales ?? "en"
    this.select_ = selectorFor(this.locale)
  }

  select(n: number): Category {
    return this.select_(n)
  }

  resolvedOptions() {
    return { locale: this.locale, type: "cardinal" as const, pluralCategories: ["one", "few", "many", "other"] }
  }

  static supportedLocalesOf(locales?: string | string[]): string[] {
    if (!locales) return []
    return (Array.isArray(locales) ? locales : [locales]).filter((tag) => tag.split("-")[0].toLowerCase() in SELECTORS)
  }
}

/**
 * Installs the stand-in when the engine cannot pluralise Russian. Returns
 * whether it had to. Safe to call more than once.
 */
export function installPluralRules(target: { Intl: typeof Intl } = globalThis as { Intl: typeof Intl }): boolean {
  if (enginePluralsWork(target.Intl)) return false
  const intl = (target.Intl ?? {}) as typeof Intl & { PluralRules: unknown }
  intl.PluralRules = MinimalPluralRules as unknown as typeof Intl.PluralRules
  target.Intl = intl
  return true
}
