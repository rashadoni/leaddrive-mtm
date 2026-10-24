import { ASK_AGAIN_AFTER_MS, PLAY_INSTALLER, TIME_APP_CERTIFICATE, TIME_APP_CHANNEL, TIME_APP_PACKAGE, TIME_APP_DOWNLOAD_URL, TIME_APP_STORE_URL, parseTimeAppLatest, shouldAskTimeUpdate, timeUpdateOffer } from "../../src/services/time-app-update-policy"
import az from "../../src/i18n/locales/az.json"
import ru from "../../src/i18n/locales/ru.json"
import en from "../../src/i18n/locales/en.json"

const server = {
  packageName: TIME_APP_PACKAGE, channel: TIME_APP_CHANNEL, signingCertificateSha256: TIME_APP_CERTIFICATE,
  apkSha256: "a".repeat(64), versionCode: 1100, versionName: "1.0.1", downloadUrl: TIME_APP_DOWNLOAD_URL, storeUrl: null,
}
describe("Time update identity", () => {
  it("accepts only its own release contract", () => {
    expect(parseTimeAppLatest(server)).toEqual({ versionCode: 1100, versionName: "1.0.1", downloadUrl: TIME_APP_DOWNLOAD_URL, storeUrl: null })
  })
  it.each([
    { packageName: "com.mtmobileapp" }, { channel: "field-stable" }, { signingCertificateSha256: "b".repeat(64) },
    { downloadUrl: "https://app.leaddrivecrm.org/field/download" }, { downloadUrl: `${TIME_APP_DOWNLOAD_URL}?redirect=field` },
    { downloadUrl: "https://example.org/time/download" }, { downloadUrl: TIME_APP_DOWNLOAD_URL.replace("https:", "http:") },
    { storeUrl: "https://play.google.com/store/apps/details?id=com.mtmobileapp" },
    { storeUrl: `${TIME_APP_STORE_URL}.evil` }, { storeUrl: "https://app.leaddrivecrm.org/field/download" },
    { versionCode: "1100" }, { versionCode: -1 }, { versionName: "latest" }, { apkSha256: null },
  ])("refuses a different app, destination or malformed release: %j", patch => {
    expect(parseTimeAppLatest({ ...server, ...patch })).toBeNull()
  })
  it("treats no accepted release as no offer", () => {
    expect(parseTimeAppLatest({ code: "TIME_APP_RELEASE_UNAVAILABLE" })).toBeNull()
    expect(timeUpdateOffer({ installedCode: 1042, installer: null, latest: null })).toBeNull()
  })
})
describe("Time delivery provenance", () => {
  const latest = parseTimeAppLatest(server)
  it("offers a newer Time APK to sideloaded installations", () => {
    for (const installer of [null, "", "com.google.android.packageinstaller"]) {
      expect(timeUpdateOffer({ installedCode: 1042, installer, latest })).toEqual({ versionName: "1.0.1", versionCode: 1100, url: TIME_APP_DOWNLOAD_URL, delivery: "apk" })
    }
  })
  it.each([1100, 1101, NaN, 0, 10.5])("does not offer an update for installed build %s", installedCode => {
    expect(timeUpdateOffer({ installedCode, installer: null, latest })).toBeNull()
  })
  it("never offers an APK to a Play install and uses only the Time listing once enabled", () => {
    expect(timeUpdateOffer({ installedCode: 1042, installer: PLAY_INSTALLER, latest })).toBeNull()
    const onPlay = parseTimeAppLatest({ ...server, storeUrl: TIME_APP_STORE_URL })
    for (const installer of [PLAY_INSTALLER, null]) {
      expect(timeUpdateOffer({ installedCode: 1042, installer, latest: onPlay })).toMatchObject({ url: TIME_APP_STORE_URL, delivery: "play" })
    }
  })
})
describe("Time reminder timing and copy", () => {
  const now = 1_800_000_000_000
  const input = { now, versionCode: 1100, lastAsked: { versionCode: 1100, at: now - 1_000 } }
  it("asks on cold start, waits after Later on resume, and allows a newly published build", () => {
    expect(shouldAskTimeUpdate({ ...input, coldStart: true })).toBe(true)
    expect(shouldAskTimeUpdate({ ...input, coldStart: false })).toBe(false)
    expect(shouldAskTimeUpdate({ ...input, coldStart: false, now: now + ASK_AGAIN_AFTER_MS })).toBe(true)
    expect(shouldAskTimeUpdate({ ...input, coldStart: false, versionCode: 1101 })).toBe(true)
  })
  it.each([az, ru, en])("provides Time-specific manual-install and Play copy in each language", messages => {
    expect(Object.keys(messages.timeAppUpdate).sort()).toEqual(["download", "later", "messageApk", "messagePlay", "openPlay", "title"])
    expect(messages.timeAppUpdate.messageApk).toContain("Time {{version}}")
    expect(messages.timeAppUpdate.messageApk).toContain("Android")
    expect(messages.timeAppUpdate.messagePlay).toContain("Google Play")
  })
})
