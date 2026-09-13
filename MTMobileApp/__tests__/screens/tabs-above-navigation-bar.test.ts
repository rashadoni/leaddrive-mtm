import fs from "fs"
import path from "path"

/**
 * B18 device acceptance, 2026-09-13, Samsung S23 Ultra, Android 16, build52.
 * The acceptance was "captions are not cut off". They were not cut off — they
 * were not there: the window ran under the three-button navigation bar
 * (y 2181–2316), the tab bar sat at 2159–2316, the tab buttons were squeezed
 * to 28 px and every caption had zero height. A tap on a tab icon reached
 * Back, Home or Recents instead of the tab.
 *
 * Android 16 enforces edge-to-edge for targetSdk 36 even though this app sets
 * `edgeToEdgeEnabled=false`, so the boundary has to be restored natively. This
 * test holds the shape of that fix; whether the bar is above the system bar is
 * checked on the phone.
 */
const root = path.resolve(__dirname, "../..")
const activity = fs.readFileSync(
  path.join(root, "android/app/src/main/java/com/mtmobileapp/MainActivity.kt"),
  "utf8",
)
const gradleProperties = fs.readFileSync(path.join(root, "android/gradle.properties"), "utf8")
const appBuild = fs.readFileSync(path.join(root, "android/build.gradle"), "utf8")

describe("B18: the tab bar lives above the system navigation bar", () => {
  it("pads the content view by the navigation bar, not the status bar", () => {
    expect(activity).toContain("keepContentOutOfNavigationBar()")
    expect(activity).toContain("WindowInsetsCompat.Type.navigationBars()")
    expect(activity).toContain("view.setPadding(navigationBar.left, 0, navigationBar.right, navigationBar.bottom)")
    // Headers already add the status bar inset in JavaScript; padding the top
    // here too would push every header down by the status bar a second time.
    expect(activity).not.toContain("Type.statusBars()")
    expect(activity).not.toContain("Type.systemBars()")
  })

  it("passes the insets on instead of consuming them", () => {
    const listener = activity.slice(activity.indexOf("setOnApplyWindowInsetsListener"), activity.indexOf("requestApplyInsets"))
    // The lambda's last expression is its return value.
    expect(listener).toMatch(/\n\s*insets\n\s*\}/)
    expect(activity).not.toContain("WindowInsetsCompat.CONSUMED")
  })

  it("runs after the React root is attached", () => {
    const onCreate = activity.slice(activity.indexOf("override fun onCreate"), activity.indexOf("private fun keepContentOutOfNavigationBar"))
    expect(onCreate.indexOf("super.onCreate(null)")).toBeLessThan(onCreate.indexOf("keepContentOutOfNavigationBar()"))
  })

  it("is needed only because the platform ignores the opt-out", () => {
    // If either of these changes, the padding above has to be revisited:
    // edge-to-edge in React Native pads through safe-area-context instead.
    expect(gradleProperties).toContain("edgeToEdgeEnabled=false")
    expect(appBuild).toContain("targetSdkVersion = 36")
  })
})
