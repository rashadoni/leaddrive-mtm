import i18next from "i18next"

/**
 * Locale-aware upper-casing (field UX audit M-08, task B13).
 *
 * `String.prototype.toUpperCase()` and the uppercase text-transform style
 * both ignore the UI language, so Azerbaijani "i" became "I" instead of "İ"
 * ("KÖMƏKÇI" for "köməkçi"). Every user-visible upper-casing goes through
 * here; enum/role comparisons keep the plain `toUpperCase()`.
 */
const LOCALE_TAGS: Record<string, string> = {
  az: "az-Latn-AZ",
  ru: "ru-RU",
  en: "en-US",
}

export function upperLocaleTag(locale?: string | null): string {
  const base = (locale ?? "").split("-")[0].toLowerCase()
  return LOCALE_TAGS[base] ?? (locale || "en-US")
}

export function upper(text: string, locale: string | null | undefined = i18next.language): string {
  return text.toLocaleUpperCase(upperLocaleTag(locale))
}

/**
 * Sentence case in the UI language: only the first character goes up.
 *
 * The capitalize text-transform raised every word — «14 Sentyabr 2026, Bazar
 * Ertəsi», «План На Понедельник, 14 Сентября» — while Azerbaijani and Russian
 * write months and weekdays in lower case, and it would have turned «iyun»
 * into «Iyun» with a dotless I.
 */
export function upperFirst(text: string, locale?: string | null): string {
  return text ? upper(text.charAt(0), locale) + text.slice(1) : text
}

/** First character of a name for an avatar, upper-cased in the UI language. */
export function upperInitial(text: string | null | undefined, fallback = "?", locale?: string | null): string {
  const first = (text ?? "").trim().charAt(0)
  return first ? upper(first, locale) : fallback
}
