import en from "../../src/i18n/locales/en.json"
import ru from "../../src/i18n/locales/ru.json"
import az from "../../src/i18n/locales/az.json"
import { CACHED_VIEW_NOTICE_KEYS, cachedViewNotice } from "../../src/lib/cached-view-notice"

describe("why a screen shows saved data (field UX audit T7)", () => {
  it("says nothing when the request succeeded", () => {
    expect(cachedViewNotice({ online: true, requestFailed: false })).toBe("none")
    expect(cachedViewNotice({ online: false, requestFailed: false })).toBe("none")
  })

  it("blames the network only when the network is actually down", () => {
    expect(cachedViewNotice({ online: false, requestFailed: true })).toBe("offline")
  })

  it("does not call a server error an outage", () => {
    // The agent used to be told their connection was gone while the phone had
    // full signal, and went looking at settings instead of calling support.
    expect(cachedViewNotice({ online: true, requestFailed: true })).toBe("server-error")
  })

  it("claims no cause while connectivity is unknown", () => {
    // NetInfo has not reported yet. Saying "you are offline" would be a guess
    // dressed as a fact.
    expect(cachedViewNotice({ online: null, requestFailed: true })).toBe("stale")
    expect(cachedViewNotice({ online: undefined, requestFailed: true })).toBe("stale")
  })

  it("has a string for every notice it can produce", () => {
    for (const notice of ["offline", "server-error", "stale"] as const) {
      expect(typeof CACHED_VIEW_NOTICE_KEYS[notice]).toBe("string")
    }
  })

  it("has that string in every language", () => {
    const missing: string[] = []
    for (const [name, bundle] of [["en", en], ["ru", ru], ["az", az]] as Array<[string, any]>) {
      for (const key of Object.values(CACHED_VIEW_NOTICE_KEYS)) {
        const [ns, leaf] = key.split(".")
        if (typeof bundle?.[ns]?.[leaf] !== "string") missing.push(`${name}.json → ${key}`)
      }
    }
    expect(missing).toEqual([])
  })
})
