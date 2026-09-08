import en from "../../src/i18n/locales/en.json"
import ru from "../../src/i18n/locales/ru.json"
import az from "../../src/i18n/locales/az.json"
import {
  ACTIVE_ALERT_WINDOW_DAYS,
  ALERT_MESSAGE_KEYS,
  ALERT_MESSAGE_PARAMS,
  isActiveAlert,
  readAlertMessage,
} from "../../src/lib/alert-messages"

const LOCALES: Array<[string, Record<string, any>]> = [["en", en], ["ru", ru], ["az", az]]

describe("alert messages (field UX audit A4)", () => {
  it("has a string for every key in every language", () => {
    for (const [name, bundle] of LOCALES) {
      for (const key of ALERT_MESSAGE_KEYS) {
        expect(typeof bundle.alertMessages?.[key], `${name}.json is missing alertMessages.${key}`).toBe("string")
      }
    }
  })

  it("spends every parameter the server sends, in every language", () => {
    // The silent failure: a translation drops {{geofenceRadius}} and the rep
    // reads "your check-in was 340 m away" with no idea what the limit was.
    // i18next renders that happily.
    for (const [name, bundle] of LOCALES) {
      for (const key of ALERT_MESSAGE_KEYS) {
        for (const param of ALERT_MESSAGE_PARAMS[key]) {
          expect(bundle.alertMessages[key], `${name}.json → ${key} never uses {{${param}}}`).toContain(`{{${param}}}`)
        }
      }
    }
  })

  it("asks for no parameter the server does not send", () => {
    for (const [name, bundle] of LOCALES) {
      for (const key of ALERT_MESSAGE_KEYS) {
        const used = [...String(bundle.alertMessages[key]).matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1])
        for (const param of used) {
          expect(ALERT_MESSAGE_PARAMS[key], `${name}.json → ${key} asks for {{${param}}}`).toContain(param)
        }
      }
    }
  })

  it("reads back what the server wrote", () => {
    expect(readAlertMessage({ routeId: "r-1", messageKey: "agentRouteDeviation", messageParams: { deviationMeters: 800 } })).toEqual({
      kind: "localized",
      key: "agentRouteDeviation",
      params: { deviationMeters: 800 },
    })
  })

  it("falls back to the stored sentence for anything it cannot render", () => {
    // Older row, key from a newer server, or params that lost a number: show
    // the English the server baked in rather than an empty card.
    expect(readAlertMessage({ customerId: "c-1" })).toEqual({ kind: "legacy" })
    expect(readAlertMessage({ messageKey: "somethingNewer", messageParams: {} })).toEqual({ kind: "legacy" })
    expect(readAlertMessage({ messageKey: "agentRouteDeviation", messageParams: {} })).toEqual({ kind: "legacy" })
    expect(readAlertMessage(null)).toEqual({ kind: "legacy" })
  })

  describe("active window", () => {
    const now = new Date("2026-09-08T10:00:00.000Z")
    const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()

    it("keeps a recent unresolved alert", () => {
      expect(isActiveAlert({ isResolved: false, createdAt: daysAgo(1) }, now)).toBe(true)
    })

    it("drops the June alert that was still listed as active in September", () => {
      expect(isActiveAlert({ isResolved: false, createdAt: "2026-06-11T09:00:00.000Z" }, now)).toBe(false)
    })

    it("drops a resolved alert however fresh", () => {
      expect(isActiveAlert({ isResolved: true, createdAt: daysAgo(0) }, now)).toBe(false)
    })

    it("treats the window edge as still active", () => {
      expect(isActiveAlert({ isResolved: false, createdAt: daysAgo(ACTIVE_ALERT_WINDOW_DAYS) }, now)).toBe(true)
      expect(isActiveAlert({ isResolved: false, createdAt: daysAgo(ACTIVE_ALERT_WINDOW_DAYS + 1) }, now)).toBe(false)
    })

    it("does not treat a broken date as fresh", () => {
      // Otherwise the rows this window exists to hide come back at the top.
      expect(isActiveAlert({ isResolved: false, createdAt: "not a date" }, now)).toBe(false)
      expect(isActiveAlert({ isResolved: false, createdAt: null }, now)).toBe(false)
    })

    it("keeps an alert whose clock ran ahead of the phone", () => {
      // Device time drift is common in the field; a future timestamp is not a
      // reason to hide a warning that just arrived.
      expect(isActiveAlert({ isResolved: false, createdAt: new Date(now.getTime() + 60_000).toISOString() }, now)).toBe(true)
    })
  })
})
