import fs from "fs"
import path from "path"

/**
 * Google Play allows the one-tap «let the app ignore battery optimisation?»
 * dialog, and the REQUEST_IGNORE_BATTERY_OPTIMIZATIONS permission behind it,
 * only to messengers, security apps and the like; field tracking is not on
 * the list. Owner, 2026-10-18: open the phone's battery settings instead.
 */

const mockNative: Record<string, jest.Mock> = {}
jest.mock("react-native", () => ({
  NativeModules: { get FieldNotifications() { return mockNative } },
  PermissionsAndroid: {},
  Platform: { OS: "android" },
}))

import { openBatterySleepSettings } from "../../src/services/field-notifications"

const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8")

beforeEach(() => {
  for (const key of Object.keys(mockNative)) delete mockNative[key]
})

describe("the battery line opens the phone's settings", () => {
  it("opens the settings list and says only that a screen opened", async () => {
    mockNative.openBatteryOptimizationSettings = jest.fn(async () => true)
    expect(await openBatterySleepSettings()).toBe(true)
    expect(mockNative.openBatteryOptimizationSettings).toHaveBeenCalledTimes(1)
  })

  it("never reaches for the old one-tap dialog", async () => {
    mockNative.requestIgnoreBatteryOptimizations = jest.fn(async () => true)
    expect(await openBatterySleepSettings()).toBe(false)
    expect(mockNative.requestIgnoreBatteryOptimizations).not.toHaveBeenCalled()
  })

  it("a native failure is not a crash", async () => {
    mockNative.openBatteryOptimizationSettings = jest.fn(async () => { throw new Error("fictional hidden settings") })
    expect(await openBatterySleepSettings()).toBe(false)
  })
})

describe("nothing asks for the exemption directly", () => {
  it("the manifest keeps the permission out, whatever a library declares", () => {
    const manifest = read("android/app/src/main/AndroidManifest.xml")
    const lines = manifest.split("\n").filter((line) => line.includes("android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS"))
    expect(lines.map((line) => line.trim())).toEqual([
      '<uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" tools:node="remove" />',
    ])
    expect(manifest).toContain('xmlns:tools="http://schemas.android.com/tools"')
  })

  it("the native module opens the settings list, not the dialog", () => {
    const native = read("android/app/src/main/java/com/mtmobileapp/FieldNotificationsModule.kt")
    expect(native).not.toContain("Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS")
    expect(native).not.toContain("fun requestIgnoreBatteryOptimizations(")
    const method = native.slice(native.indexOf("fun openBatteryOptimizationSettings("))
    expect(method).toContain("Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)")
  })

  it("«Маршрут» says why in its own sheet before the settings open", () => {
    const screen = read("src/screens/route/RouteScreen.tsx")
    const start = screen.indexOf("const askBatteryExemptionOnce = useCallback(")
    const body = screen.slice(start, screen.indexOf("}, [copy, refreshBatteryExempt])", start))
    expect(start).toBeGreaterThan(-1)
    expect(body.indexOf("await ask({")).toBeGreaterThan(-1)
    expect(body).toContain("{ text: copy.batterySleepLater, value: false, style: \"cancel\" }")
    expect(body.indexOf("if (open) await openBatterySleepSettings()")).toBeGreaterThan(body.indexOf("await ask({"))
    expect(screen).not.toContain("askBatterySleepExemption")
  })

  it("the words no longer promise one tap", () => {
    const screen = read("src/screens/route/RouteScreen.tsx")
    const bodies = screen.match(/batterySleepBody: "[^"]*"/g) ?? []
    expect(bodies).toHaveLength(3)
    expect(bodies.filter((body) => /одно касание|one tap|bir toxunuş/.test(body))).toEqual([])
    expect(bodies.filter((body) => !body.includes("LeadDrive Route Field"))).toEqual([])
  })
})
