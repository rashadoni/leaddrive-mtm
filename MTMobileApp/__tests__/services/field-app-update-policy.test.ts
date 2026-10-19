import fs from "fs"
import path from "path"
import {
  ASK_AGAIN_AFTER_MS,
  PLAY_INSTALLER,
  parseFieldAppLatest,
  shouldAskNow,
  updateOffer,
} from "../../src/services/field-app-update-policy"

const SERVER = {
  versionCode: 1640,
  versionName: "3.11.33",
  downloadUrl: "https://app.leaddrivecrm.org/field/download",
  pageUrl: "https://app.leaddrivecrm.org/field",
  storeUrl: null,
}

describe("the server's answer", () => {
  it("is taken as it comes from app.leaddrivecrm.org", () => {
    expect(parseFieldAppLatest(SERVER)).toEqual({
      versionCode: 1640,
      versionName: "3.11.33",
      downloadUrl: "https://app.leaddrivecrm.org/field/download",
      storeUrl: null,
    })
  })

  it("never sends the phone to an address of somebody else", () => {
    expect(parseFieldAppLatest({ ...SERVER, downloadUrl: "https://evil.example/app.apk" })).toBeNull()
    expect(parseFieldAppLatest({ ...SERVER, storeUrl: "https://evil.example/store" })).toBeNull()
    expect(parseFieldAppLatest({ ...SERVER, downloadUrl: "http://app.leaddrivecrm.org/field/download" })).toBeNull()
  })

  it("is refused when the version is not one", () => {
    expect(parseFieldAppLatest({ ...SERVER, versionCode: "1640" })).toBeNull()
    expect(parseFieldAppLatest({ ...SERVER, versionName: "latest" })).toBeNull()
    expect(parseFieldAppLatest({ error: "No build is available right now" })).toBeNull()
    expect(parseFieldAppLatest(null)).toBeNull()
  })
})

describe("what is offered", () => {
  const latest = parseFieldAppLatest(SERVER)

  it("a newer build to a phone that installed the APK", () => {
    expect(updateOffer({ installedCode: 1634, installer: "com.google.android.packageinstaller", latest })).toEqual({
      versionName: "3.11.33",
      versionCode: 1640,
      url: "https://app.leaddrivecrm.org/field/download",
    })
    expect(updateOffer({ installedCode: 1634, installer: null, latest })?.versionCode).toBe(1640)
  })

  it("nothing when the phone already has that build or a newer one", () => {
    expect(updateOffer({ installedCode: 1640, installer: null, latest })).toBeNull()
    expect(updateOffer({ installedCode: 1700, installer: null, latest })).toBeNull()
    expect(updateOffer({ installedCode: NaN, installer: null, latest })).toBeNull()
    expect(updateOffer({ installedCode: 1634, installer: null, latest: null })).toBeNull()
  })

  it("never an APK to a copy installed from Google Play", () => {
    expect(updateOffer({ installedCode: 1634, installer: PLAY_INSTALLER, latest })).toBeNull()
    const onPlay = parseFieldAppLatest({ ...SERVER, storeUrl: "https://play.google.com/store/apps/details?id=com.mtmobileapp" })
    expect(updateOffer({ installedCode: 1634, installer: PLAY_INSTALLER, latest: onPlay })?.url)
      .toBe("https://play.google.com/store/apps/details?id=com.mtmobileapp")
  })

  it("the store to everybody once the server names it", () => {
    const onPlay = parseFieldAppLatest({ ...SERVER, storeUrl: "market://details?id=com.mtmobileapp" })
    expect(updateOffer({ installedCode: 1634, installer: null, latest: onPlay })?.url).toBe("market://details?id=com.mtmobileapp")
  })
})

describe("when it is asked", () => {
  const now = 1_800_000_000_000

  it("on every start", () => {
    expect(shouldAskNow({ coldStart: true, now, lastAsked: { versionCode: 1640, at: now - 1000 }, versionCode: 1640 })).toBe(true)
  })

  it("on a return to the app only for a newer build or half a day later", () => {
    expect(shouldAskNow({ coldStart: false, now, lastAsked: { versionCode: 1640, at: now - 1000 }, versionCode: 1640 })).toBe(false)
    expect(shouldAskNow({ coldStart: false, now, lastAsked: { versionCode: 1634, at: now - 1000 }, versionCode: 1640 })).toBe(true)
    expect(shouldAskNow({ coldStart: false, now, lastAsked: { versionCode: 1640, at: now - ASK_AGAIN_AFTER_MS }, versionCode: 1640 })).toBe(true)
    expect(shouldAskNow({ coldStart: false, now, lastAsked: null, versionCode: 1640 })).toBe(true)
  })
})

describe("wiring", () => {
  const root = path.join(__dirname, "../..")
  const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8")

  it("the app checks on start and on a return to the foreground", () => {
    const app = read("src/runtime/AndroidApp.tsx")
    expect(app).toContain("checkFieldAppUpdate({ coldStart: true })")
    expect(app).toContain("checkFieldAppUpdate({ coldStart: false })")
  })

  it("installs nothing itself: the browser downloads and Android installs", () => {
    // REQUEST_INSTALL_PACKAGES is a permission Google Play restricts; the app
    // only opens the link and must never declare it.
    expect(read("android/app/src/main/AndroidManifest.xml")).not.toContain("REQUEST_INSTALL_PACKAGES")
    expect(read("src/services/field-app-update.ts")).toContain("Linking.openURL(offer.url)")
  })

  it("speaks the agent's language", () => {
    for (const lang of ["az", "ru", "en"]) {
      const messages = JSON.parse(read(`src/i18n/locales/${lang}.json`))
      expect(Object.keys(messages.appUpdate).sort()).toEqual(["later", "message", "title", "update"])
      expect(messages.appUpdate.message).toContain("{{version}}")
    }
  })
})
