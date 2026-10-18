import { answerChoice, appFeedbackStore, dismissAllChoices, dismissChoice, resetAppFeedback } from "../../src/services/app-feedback"
import {
  askLocationDisclosure,
  LOCATION_DISCLOSURE_KEYS,
  requestLocationAfterDisclosure,
} from "../../src/services/location-disclosure"
import { mobileResources } from "../../src/i18n/mobile-resources"

/**
 * Google Play's «prominent disclosure» before the location sheet
 * (support.google.com/googleplay/android-developer/answer/9799150): in the
 * app's own window, before Android's, naming location, the features, «even
 * when the app is closed or not in use» and who sees it. Run on the real
 * feedback store with the real dictionaries.
 */

type Locale = "ru" | "en" | "az"
const LOCALES: Locale[] = ["ru", "en", "az"]

function translate(locale: Locale) {
  return (key: string): string => {
    let node: unknown = mobileResources[locale]
    for (const part of key.split(".")) node = (node as Record<string, unknown> | undefined)?.[part]
    if (typeof node !== "string") throw new Error(`missing ${locale}:${key}`)
    return node
  }
}

async function flush() {
  for (let i = 0; i < 6; i++) await Promise.resolve()
}

function press(label: string) {
  const choice = appFeedbackStore.getState().choice
  if (!choice) throw new Error("no disclosure on screen")
  answerChoice(choice.id, choice.buttons.findIndex((button) => button.text === label))
}

beforeEach(() => resetAppFeedback())

describe("the disclosure stands before Android's sheet", () => {
  const t = translate("ru")

  it("«Не сейчас» answers no and Android's sheet is never asked for", async () => {
    const request = jest.fn(async () => true)
    const pending = requestLocationAfterDisclosure({ t, granted: async () => false, request })
    await flush()
    expect(appFeedbackStore.getState().choice?.title).toBe(t(LOCATION_DISCLOSURE_KEYS.title))
    expect(request).not.toHaveBeenCalled()
    press("Не сейчас")
    expect(await pending).toBe(false)
    expect(request).not.toHaveBeenCalled()
  })

  it("«Продолжить» opens Android's sheet, and its answer is the result", async () => {
    const request = jest.fn(async () => false)
    const pending = requestLocationAfterDisclosure({ t, granted: async () => false, request })
    await flush()
    expect(request).not.toHaveBeenCalled()
    press("Продолжить")
    expect(await pending).toBe(false)
    expect(request).toHaveBeenCalledTimes(1)
  })

  it("the back button, a tap outside or a logout count as «Не сейчас»", async () => {
    const request = jest.fn(async () => true)
    const back = requestLocationAfterDisclosure({ t, granted: async () => false, request })
    await flush()
    dismissChoice(appFeedbackStore.getState().choice!.id)
    expect(await back).toBe(false)
    const logout = requestLocationAfterDisclosure({ t, granted: async () => false, request })
    await flush()
    dismissAllChoices()
    expect(await logout).toBe(false)
    expect(request).not.toHaveBeenCalled()
  })

  it("a grant already given shows nothing", async () => {
    const request = jest.fn(async () => true)
    expect(await requestLocationAfterDisclosure({ t, granted: async () => true, request })).toBe(true)
    expect(appFeedbackStore.getState().choice).toBeNull()
    expect(request).not.toHaveBeenCalled()
  })

  it("two paths asking at once share one disclosure and one answer", async () => {
    const first = askLocationDisclosure(t)
    const second = askLocationDisclosure(t)
    await flush()
    expect(appFeedbackStore.getState().pendingChoices).toEqual([])
    press("Продолжить")
    expect(await first).toBe(true)
    expect(await second).toBe(true)
  })

  it("«Не сейчас» is the cancel button and «Продолжить» the main one", async () => {
    void askLocationDisclosure(t)
    await flush()
    expect(appFeedbackStore.getState().choice?.buttons).toEqual([
      { text: "Не сейчас", style: "cancel" },
      { text: "Продолжить", style: "default" },
    ])
  })
})

// The words Google looks for, in each language, quoting the app's real buttons.
const WORDS: Record<Locale, { location: string; closed: string; managers: string }> = {
  ru: { location: "местоположени", closed: "даже когда приложение закрыто или не используется", managers: "руководители вашей компании" },
  en: { location: "location", closed: "even when the app is closed or not in use", managers: "company's managers" },
  az: { location: "məkan", closed: "hətta tətbiq bağlı olduqda və ya istifadə edilmədikdə belə", managers: "şirkətinizin rəhbərləri" },
}

describe.each(LOCALES)("the words in %s", (locale) => {
  const t = translate(locale)
  const words = WORDS[locale]

  it("the disclosure names location, the features, «even when closed», the managers and what stops it", () => {
    const body = t(LOCATION_DISCLOSURE_KEYS.body)
    const missing = [
      words.location,
      words.closed,
      words.managers,
      `«${t("todayV2.breakDay")}»`,
      `«${t("todayV2.endDay")}»`,
    ].filter((phrase) => !body.includes(phrase))
    expect(missing).toEqual([])
    expect(t(LOCATION_DISCLOSURE_KEYS.title)).toContain(words.location)
    expect(t(LOCATION_DISCLOSURE_KEYS.accept).length).toBeGreaterThan(0)
    expect(t(LOCATION_DISCLOSURE_KEYS.decline).length).toBeGreaterThan(0)
  })

  it("the Today card that asks for «all the time» follows the same template", () => {
    const body = t("todayV2.backgroundLocationBody")
    const missing = [words.location, words.closed, words.managers, `«${t("todayV2.breakDay")}»`, `«${t("todayV2.endDay")}»`]
      .filter((phrase) => !body.includes(phrase))
    expect(missing).toEqual([])
  })
})

it("the three languages carry the same disclosure keys", () => {
  const keys = LOCALES.map((locale) => Object.keys(mobileResources[locale].locationDisclosure).sort())
  expect(keys[1]).toEqual(keys[0])
  expect(keys[2]).toEqual(keys[0])
})
