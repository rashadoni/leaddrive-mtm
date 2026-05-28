import az from "../../src/i18n/locales/az.json"
import en from "../../src/i18n/locales/en.json"
import ru from "../../src/i18n/locales/ru.json"

/**
 * G1 — i18n coverage for the background location service.
 *
 * `src/services/location.ts` uses taskTitle/taskDesc in the Android
 * foreground notification. These were hardcoded in Russian; they must be
 * i18n keys resolvable at runtime. This test locks the key contract so
 * the service can't regress back to hardcoded strings.
 *
 * Covered keys:
 *   location.taskTitle — Android notification title ("MTM — Location Tracking")
 *   location.taskDesc  — Android notification body  ("Your location is being shared")
 */

type Locales = typeof az

function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key]
    return undefined
  }, obj)
}

const ALL_LOCALES: Array<[string, Locales]> = [
  ["az", az],
  ["en", en],
  ["ru", ru],
]

const REQUIRED_LOCATION_KEYS = ["location.taskTitle", "location.taskDesc"]

describe("G1 — location.* i18n keys (background service)", () => {
  it.each(REQUIRED_LOCATION_KEYS)(
    'key "%s" is present and non-empty in all 3 locales',
    (key) => {
      for (const [lang, locale] of ALL_LOCALES) {
        const value = getPath(locale as unknown as Record<string, unknown>, key)
        expect(value).toBeTruthy()
        expect(typeof value).toBe("string")
        expect((value as string).length).toBeGreaterThan(0)
      }
    }
  )

  it("taskTitle differs between az and ru (i18n is active)", () => {
    expect(getPath(az as unknown as Record<string, unknown>, "location.taskTitle")).not.toBe(
      getPath(ru as unknown as Record<string, unknown>, "location.taskTitle")
    )
  })

  it("taskTitle differs between en and ru", () => {
    expect(getPath(en as unknown as Record<string, unknown>, "location.taskTitle")).not.toBe(
      getPath(ru as unknown as Record<string, unknown>, "location.taskTitle")
    )
  })
})
