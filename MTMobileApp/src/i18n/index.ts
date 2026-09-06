/**
 * M1-1a — i18next bootstrap for the mobile app.
 *
 * Locale resolution order (per `resolveInitialLocale`):
 *   1. User's stored choice from Profile screen (AsyncStorage)
 *   2. First supported device locale (react-native-localize)
 *   3. Hard fallback to Russian (Mars seed data convention)
 *
 * Boot sequence: App.tsx awaits `initI18n()` before rendering trees that
 * use `useTranslation()`. After init, `setLocale(code)` switches at
 * runtime and persists the choice.
 */
import i18n from "i18next"
import { installPluralRules } from "./plural-rules"
import { initReactI18next } from "react-i18next"
import * as RNLocalize from "react-native-localize"
import AsyncStorage from "@react-native-async-storage/async-storage"
import az from "./locales/az.json"
import en from "./locales/en.json"
import ru from "./locales/ru.json"
import {
  resolveInitialLocale,
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "./resolve-initial-locale"

const STORAGE_KEY = "@mtm_locale"

export async function initI18n(): Promise<void> {
  // Before init: i18next reads Intl.PluralRules at configure time, and Hermes
  // may not have it. Without this the Russian forms in the dictionaries never
  // get chosen and every count reads as "точек".
  installPluralRules()
  if (i18n.isInitialized) return
  const stored = await AsyncStorage.getItem(STORAGE_KEY)
  const deviceLocales = RNLocalize.getLocales().map((l) => l.languageTag)
  const initial = resolveInitialLocale({ storedLocale: stored, deviceLocales })

  await i18n.use(initReactI18next).init({
    compatibilityJSON: "v4",
    lng: initial,
    fallbackLng: DEFAULT_LOCALE,
    resources: {
      az: { translation: az },
      en: { translation: en },
      ru: { translation: ru },
    },
    interpolation: { escapeValue: false }, // React already escapes
    returnNull: false,
  })
}

export async function setLocale(locale: SupportedLocale): Promise<void> {
  if (!(SUPPORTED_LOCALES as readonly string[]).includes(locale)) return
  await AsyncStorage.setItem(STORAGE_KEY, locale)
  await i18n.changeLanguage(locale)
}

export function getCurrentLocale(): SupportedLocale {
  const code = (i18n.language ?? DEFAULT_LOCALE).split("-")[0]
  return (SUPPORTED_LOCALES as readonly string[]).includes(code)
    ? (code as SupportedLocale)
    : DEFAULT_LOCALE
}

export { i18n, SUPPORTED_LOCALES, DEFAULT_LOCALE }
export type { SupportedLocale }
