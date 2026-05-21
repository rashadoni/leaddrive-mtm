/**
 * M1-1a — Pick best initial locale for the app session.
 *
 * Priority order:
 *   1. Stored user choice (Profile screen toggle persisted to AsyncStorage).
 *      Trumps everything — user explicitly chose this.
 *   2. First supported device locale (typical RN flow gives an array
 *      in user-preference order from the OS).
 *   3. Fallback to "ru" — most legacy Mars seed data + Russian-speaking
 *      dev team, so it's the safest default for unknown locales.
 *
 * Pure function — no AsyncStorage, no `react-native-localize`. The boot
 * code reads those upstream and hands the result here.
 */

export type SupportedLocale = "az" | "en" | "ru"
export const SUPPORTED_LOCALES: ReadonlyArray<SupportedLocale> = ["az", "en", "ru"]
export const DEFAULT_LOCALE: SupportedLocale = "ru"

export interface ResolveInitialLocaleInput {
  /**
   * The user's previously-persisted choice from the Profile screen.
   * `null` on first run / after logout-with-clear.
   */
  storedLocale: string | null | undefined
  /**
   * Device-reported locales in OS-preference order. Each entry can be
   * a bare code (`"az"`) or BCP-47 (`"az-AZ"`); the helper normalises.
   */
  deviceLocales: ReadonlyArray<string>
}

/**
 * Coerce an arbitrary locale tag (`"az-AZ"`, `"AZ"`, `"  ru-RU  "`) to one
 * of our supported short codes, or null if it doesn't match anything we
 * support. Lower-cased + trimmed + bare-code-after-`-` extraction.
 */
function toSupported(raw: string | null | undefined): SupportedLocale | null {
  if (!raw) return null
  const norm = raw.trim().toLowerCase().split("-")[0]
  if (!norm) return null
  return (SUPPORTED_LOCALES as ReadonlyArray<string>).includes(norm)
    ? (norm as SupportedLocale)
    : null
}

export function resolveInitialLocale(input: ResolveInitialLocaleInput): SupportedLocale {
  // 1. Stored user choice (Profile screen). Whitespace / empty / unsupported
  // values fall through to device detection.
  const fromStored = toSupported(input.storedLocale)
  if (fromStored) return fromStored

  // 2. First supported device locale in OS-preference order.
  for (const candidate of input.deviceLocales) {
    const supported = toSupported(candidate)
    if (supported) return supported
  }

  // 3. Hard fallback — most legacy Mars seed data is in Russian.
  return DEFAULT_LOCALE
}
