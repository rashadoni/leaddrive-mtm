import fs from "fs"
import path from "path"

/**
 * Redmi Pad SE, Android 15, 2026-09-14: the location foreground service ran
 * (type location, isForeground=true) with nothing in the notification shade.
 * Android 13+ hides notifications of an app without POST_NOTIFICATIONS, and
 * the app neither declared nor requested it — while the privacy policy and the
 * Google Play declaration promise a visible notification during tracking.
 */
const manifest = fs.readFileSync(path.resolve(__dirname, "../../android/app/src/main/AndroidManifest.xml"), "utf8")
const app = fs.readFileSync(path.resolve(__dirname, "../../src/runtime/AndroidApp.tsx"), "utf8")

describe("the GPS service notification can be shown", () => {
  it("declares POST_NOTIFICATIONS", () => {
    expect(manifest).toContain('<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />')
  })

  it("asks for it on Android 13+ before tracking starts", () => {
    expect(app).toContain("Number(Platform.Version) < 33")
    expect(app).toContain("PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS")
    const start = app.indexOf("if (!await requestForegroundLocation() || cancelled) return")
    const ask = app.indexOf("await requestTrackingNotification()", start)
    const track = app.indexOf("await startTracking()", start)
    expect(start).toBeGreaterThan(-1)
    expect(ask).toBeGreaterThan(start)
    expect(track).toBeGreaterThan(ask)
  })
})
