import en from "../../src/i18n/locales/en.json"
import ru from "../../src/i18n/locales/ru.json"
import az from "../../src/i18n/locales/az.json"
import { mobileResources } from "../../src/i18n/mobile-resources"
import { syncCentreState } from "../../src/lib/sync-centre-availability"

describe("sync centre availability (field UX audit T8)", () => {
  it("offers the sync when there is access and a network", () => {
    expect(syncCentreState({ online: true, hasRouteFieldAccess: true }))
      .toEqual({ canSyncNow: true, noticeKey: null })
  })

  it("does not offer a button that cannot do anything offline", () => {
    // The agent used to press it with the radio off and watch a spinner end
    // in nothing, which teaches that the app is broken.
    const state = syncCentreState({ online: false, hasRouteFieldAccess: true })
    expect(state.canSyncNow).toBe(false)
    expect(state.noticeKey).toBe("syncCenter.offlineCannotSync")
  })

  it("keeps the two reasons apart", () => {
    // No access is a permission the agent cannot change; no network fixes
    // itself. One greyed-out button for both would explain neither.
    expect(syncCentreState({ online: true, hasRouteFieldAccess: false }).noticeKey)
      .toBe("routeFieldAccess.syncBlocked")
    expect(syncCentreState({ online: false, hasRouteFieldAccess: false }).noticeKey)
      .toBe("routeFieldAccess.syncBlocked")
  })

  it("still allows a try while connectivity is unknown", () => {
    // NetInfo has not reported yet; the request itself is the better test.
    expect(syncCentreState({ online: null, hasRouteFieldAccess: true }).canSyncNow).toBe(true)
  })

  it("says nothing extra while a sync is running", () => {
    expect(syncCentreState({ online: true, hasRouteFieldAccess: true, busy: true }))
      .toEqual({ canSyncNow: false, noticeKey: null })
  })

  it("has the line in every language", () => {
    // The two notices live in different bundles — the sheet's own strings in
    // the JSON locales, the access one in mobile-resources — and a key that
    // exists in neither would render as the key itself.
    // The app reads two bundles: the JSON locales and mobile-resources. A key
    // present in neither renders as the key itself, so both are checked here.
    const missing: string[] = []
    for (const [name, bundle] of [["en", en], ["ru", ru], ["az", az]] as Array<[string, any]>) {
      if (typeof bundle?.syncCenter?.offlineCannotSync !== "string") missing.push(`${name}.json → syncCenter.offlineCannotSync`)
    }
    for (const [name, bundle] of Object.entries(mobileResources as Record<string, any>)) {
      if (typeof bundle?.routeFieldAccess?.syncBlocked !== "string") missing.push(`mobile-resources.${name} → routeFieldAccess.syncBlocked`)
    }
    expect(missing).toEqual([])
  })
})
