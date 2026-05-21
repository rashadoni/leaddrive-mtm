import {
  resolveInitialLocale,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
} from "../../src/i18n/resolve-initial-locale"

describe("resolveInitialLocale (M1-1a)", () => {
  it("returns stored locale when valid (user explicit choice trumps device)", () => {
    expect(
      resolveInitialLocale({ storedLocale: "az", deviceLocales: ["en"] }),
    ).toBe("az")
  })

  it("ignores invalid stored locale, falls through to device", () => {
    expect(
      resolveInitialLocale({ storedLocale: "fr", deviceLocales: ["az-AZ"] }),
    ).toBe("az")
  })

  it("first supported device locale wins when no stored choice", () => {
    expect(
      resolveInitialLocale({ storedLocale: null, deviceLocales: ["en-US", "ru-RU"] }),
    ).toBe("en")
  })

  it("device-locale order is honoured (RN OS preference)", () => {
    expect(
      resolveInitialLocale({ storedLocale: null, deviceLocales: ["ru-RU", "az-AZ", "en-US"] }),
    ).toBe("ru")
  })

  it("device locale BCP-47 normalised to bare code (`az-AZ` → `az`)", () => {
    expect(
      resolveInitialLocale({ storedLocale: null, deviceLocales: ["az-AZ"] }),
    ).toBe("az")
  })

  it("unsupported device locales skipped, next supported one wins", () => {
    expect(
      resolveInitialLocale({ storedLocale: null, deviceLocales: ["fr-FR", "de-DE", "en-US"] }),
    ).toBe("en")
  })

  it("all unsupported → DEFAULT_LOCALE (ru, per Mars seed convention)", () => {
    expect(
      resolveInitialLocale({ storedLocale: null, deviceLocales: ["fr-FR", "de-DE"] }),
    ).toBe(DEFAULT_LOCALE)
  })

  it("empty deviceLocales + no stored → DEFAULT_LOCALE", () => {
    expect(
      resolveInitialLocale({ storedLocale: null, deviceLocales: [] }),
    ).toBe(DEFAULT_LOCALE)
  })

  it("stored is whitespace-only → treated as unset", () => {
    expect(
      resolveInitialLocale({ storedLocale: "   ", deviceLocales: ["az-AZ"] }),
    ).toBe("az")
  })

  it("stored is empty string → treated as unset", () => {
    expect(
      resolveInitialLocale({ storedLocale: "", deviceLocales: ["en-US"] }),
    ).toBe("en")
  })

  it("SUPPORTED_LOCALES exports the 3 expected codes (test the contract)", () => {
    expect([...SUPPORTED_LOCALES].sort()).toEqual(["az", "en", "ru"])
  })

  it("stored locale case-insensitive (`AZ` → `az`)", () => {
    expect(
      resolveInitialLocale({ storedLocale: "AZ", deviceLocales: [] }),
    ).toBe("az")
  })
})
