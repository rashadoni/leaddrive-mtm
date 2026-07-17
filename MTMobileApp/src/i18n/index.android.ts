import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import * as RNLocalize from "react-native-localize"
import AsyncStorage from "@react-native-async-storage/async-storage"
import az from "./locales/az.json"
import en from "./locales/en.json"
import ru from "./locales/ru.json"
import { mobileResources } from "./mobile-resources"
import {
  resolveInitialLocale,
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "./resolve-initial-locale"

const STORAGE_KEY = "@mtm_locale"

export async function initI18n(): Promise<void> {
  if (i18n.isInitialized) return
  const stored = await AsyncStorage.getItem(STORAGE_KEY)
  const deviceLocales = RNLocalize.getLocales().map((locale) => locale.languageTag)
  const initial = resolveInitialLocale({ storedLocale: stored, deviceLocales })

  await i18n.use(initReactI18next).init({
    compatibilityJSON: "v4",
    lng: initial,
    fallbackLng: DEFAULT_LOCALE,
    resources: {
      az: { translation: { ...az, ...mobileResources.az } },
      en: { translation: { ...en, ...mobileResources.en } },
      ru: { translation: { ...ru, ...mobileResources.ru } },
    },
    interpolation: { escapeValue: false },
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
