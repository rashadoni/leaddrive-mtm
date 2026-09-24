import { readFileSync } from "fs"
import { join } from "path"

jest.mock("react-native", () => ({
  Linking: { openSettings: jest.fn() },
  PermissionsAndroid: { PERMISSIONS: {}, RESULTS: {}, check: jest.fn(), request: jest.fn() },
  Platform: { OS: "android", Version: 34 },
}))

import { needsBackgroundLocation } from "../../src/services/background-location"

/**
 * 2026-09-24, the owner's Galaxy S23: minimised, the app got a fix about once
 * in 90 s because it held location only «while in use» — and the manifest did
 * not declare the background permission, so «all the time» was not even offered.
 */
const root = join(__dirname, "..", "..")

describe("«Allow all the time» for the route", () => {
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

  it("says on the route screen what is recorded, when and why — the disclosure Play requires first", () => {
    const screen = readFileSync(join(root, "src/screens/route/RouteScreen.tsx"), "utf8")
    expect(screen).toContain("<BackgroundLocationNotice")
    expect(screen).toContain("askBackgroundLocation().then(() => refreshBackgroundLocation())")
    expect(screen).toContain('AppState.addEventListener("change"')
    for (const words of [/свёрнуто или экран выключен/, /bağlı olanda və ya ekran sönəndə/, /minimised, or the screen is off/]) {
      expect(screen).toMatch(words)
    }
    expect(screen.match(/backgroundLocationBody:/g)).toHaveLength(3)
  })
})
