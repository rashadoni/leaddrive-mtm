import { readFileSync } from "fs"
import { join } from "path"

jest.mock("react-native", () => ({
  Linking: { openSettings: jest.fn() },
  PermissionsAndroid: { PERMISSIONS: {}, RESULTS: {}, check: jest.fn(), request: jest.fn() },
  Platform: { OS: "android", Version: 34 },
}))

import { needsBackgroundLocation } from "../../src/services/background-location"

/**
 * 2026-09-29, the owner's Galaxy S23: two days without a point after a restart
 * with the workday open. Only an app allowed location «all the time» may start
 * tracking again by itself — and the manifest has to declare it, or Android
 * does not even offer the choice.
 */
const root = join(__dirname, "..", "..")

describe("«Allow all the time» for the workday", () => {
  it("is declared in the manifest, or Android never offers it", () => {
    const manifest = readFileSync(join(root, "android/app/src/main/AndroidManifest.xml"), "utf8")
    expect(manifest).toContain('<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />')
  })

  it("is asked on Android 10+ once «while in use» is granted, until it is granted", () => {
    const base = { os: "android", apiLevel: 34, foregroundGranted: true, backgroundGranted: false }
    expect(needsBackgroundLocation(base)).toBe(true)
    expect(needsBackgroundLocation({ ...base, backgroundGranted: true })).toBe(false)
    // Android grants «always» only on top of «while in use».
    expect(needsBackgroundLocation({ ...base, foregroundGranted: false })).toBe(false)
    // Before Android 10 the two were one grant.
    expect(needsBackgroundLocation({ ...base, apiLevel: 28 })).toBe(false)
    expect(needsBackgroundLocation({ ...base, os: "ios" })).toBe(false)
  })

  it("says on the Today screen what is recorded, when and why — the disclosure Play requires first", () => {
    const screen = readFileSync(join(root, "src/screens/today/TodayScreen.tsx"), "utf8")
    expect(screen).toContain("{workdayActive && backgroundLocationNeeded ? (")
    expect(screen).toContain("askBackgroundLocation().then(() => refreshBackgroundLocation())")
    expect(screen).toContain('AppState.addEventListener("change"')
    const resources = readFileSync(join(root, "src/i18n/mobile-resources.ts"), "utf8")
    for (const words of [/после перезагрузки телефона/, /telefon yenidən başladıqda/, /after the phone restarts/]) {
      expect(resources).toMatch(words)
    }
  })
})
