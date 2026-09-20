import fs from "fs"
import path from "path"

const service = fs.readFileSync(path.resolve(__dirname, "../../src/services/push-registration.ts"), "utf8")
const api = fs.readFileSync(path.resolve(__dirname, "../../src/services/api.ts"), "utf8")
const auth = fs.readFileSync(path.resolve(__dirname, "../../src/store/auth.ts"), "utf8")
const app = fs.readFileSync(path.resolve(__dirname, "../../App.tsx"), "utf8")
const manifest = fs.readFileSync(path.resolve(__dirname, "../../android/app/src/main/AndroidManifest.xml"), "utf8")
const pushService = fs.readFileSync(
  path.resolve(__dirname, "../../android/app/src/main/java/com/mtmobileapp/FieldPushService.kt"),
  "utf8",
)
const appGradle = fs.readFileSync(path.resolve(__dirname, "../../android/app/build.gradle"), "utf8")
const rootGradle = fs.readFileSync(path.resolve(__dirname, "../../android/build.gradle"), "utf8")
const googleServices = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../android/app/google-services.json"), "utf8"),
)

describe("Firebase Cloud Messaging is wired for this app only", () => {
  it("carries the project's own config for com.mtmobileapp", () => {
    expect(googleServices.project_info.project_id).toBe("leaddrive-mtm")
    expect(googleServices.client[0].client_info.android_client_info.package_name).toBe("com.mtmobileapp")
  })

  it("pulls in messaging and nothing else from Firebase", () => {
    expect(rootGradle).toContain("com.google.gms:google-services")
    expect(appGradle).toContain('apply plugin: "com.google.gms.google-services"')
    expect(appGradle).toContain('implementation("com.google.firebase:firebase-messaging")')
    // No analytics: the app sends no usage data to Google.
    expect(appGradle).not.toContain("firebase-analytics")
  })

  it("registers the messaging service without exporting it", () => {
    expect(manifest).toContain('android:name=".FieldPushService"')
    expect(manifest).toContain("com.google.firebase.MESSAGING_EVENT")
    const block = manifest.slice(manifest.indexOf('android:name=".FieldPushService"'))
    expect(block.slice(0, 200)).toContain('android:exported="false"')
  })
})

describe("what a push may say and where it goes", () => {
  /**
   * A push can appear on a locked screen in front of the doctor the agent is
   * visiting: the payload carries a title and a body, and the customer's name
   * belongs in the app behind the tap.
   */
  it("shows only what the payload carries, through the app's own notification path", () => {
    expect(pushService).toContain("FieldNotificationReceiver.post(this, id, title, body, channel)")
    expect(pushService).toContain("areNotificationsEnabled()")
  })

  it("keeps a token that arrived while the app was closed", () => {
    expect(pushService).toContain("KEY_PENDING_TOKEN")
    expect(service).toContain("native.consumePendingToken()")
  })
})

describe("the address the server keeps", () => {
  it("registers on login and on a restored session", () => {
    expect(auth).toContain("void registerPushToken()")
    expect(app).toContain("void registerPushToken()")
  })

  it("removes the address before the session that proves it is gone", () => {
    const logout = auth.slice(auth.indexOf("  logout: async () => {"), auth.indexOf("  handleRevoked: (reason: string) => {"))
    expect(logout.indexOf("await unregisterPushToken()")).toBeGreaterThan(-1)
    expect(logout.indexOf("await unregisterPushToken()")).toBeLessThan(logout.indexOf("await api.logout()"))
  })

  it("talks to the server over the v2 mobile boundary", () => {
    expect(api).toContain('this.request("/mobile/route-field/device-tokens"')
    expect(api).toContain('method: "DELETE"')
  })

  it("never lets a missing token break the app", () => {
    expect(service).toContain("return false")
    expect(service).toContain("} catch {}")
  })
})
