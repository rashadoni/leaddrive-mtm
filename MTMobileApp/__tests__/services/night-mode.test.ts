import fs from "fs"
import path from "path"
import { colorSchemeReloadDecision } from "../../src/services/color-scheme-reload-decision"
import { FIELD_PALETTES, fieldColorSchemeOf } from "../../src/theme/fieldTheme"

/**
 * Night mode (owner, 2026-10-18: «он адаптироваться должен под режим
 * смартфонов и планшетов, ночной режим»; mockup approved with «давай»).
 * The app takes the phone's theme; a switch while it is open restarts the
 * JS only when that cannot cut off a recorded workday or a half-typed field.
 */

const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8")

describe("the palette follows the phone", () => {
  it("reads only «dark» as the night palette", () => {
    expect(fieldColorSchemeOf("dark")).toBe("dark")
    expect(fieldColorSchemeOf("light")).toBe("light")
    expect(fieldColorSchemeOf(null)).toBe("light")
    expect(fieldColorSchemeOf(undefined)).toBe("light")
  })

  it("has every colour in both palettes, and the night one is dark", () => {
    expect(Object.keys(FIELD_PALETTES.dark).sort()).toEqual(Object.keys(FIELD_PALETTES.light).sort())
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    expect(luminance(FIELD_PALETTES.dark.canvas)).toBeLessThan(0.1)
    expect(luminance(FIELD_PALETTES.dark.ink)).toBeGreaterThan(0.8)
    expect(luminance(FIELD_PALETTES.light.canvas)).toBeGreaterThan(0.9)
    // Text on a filled button stays light in both.
    expect(FIELD_PALETTES.dark.onColor).toBe(FIELD_PALETTES.light.onColor)
  })

  /** 3.11.27 on the S23: white «Marşrut yarat» on the night green read at 2.5:1. */
  it("keeps white button text and accent text readable at night", () => {
    const channel = (value: number) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255))
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const contrast = (a: string, b: string) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
      return (hi + 0.05) / (lo + 0.05)
    }
    const dark = FIELD_PALETTES.dark
    expect(contrast(dark.onColor, dark.primaryStrong)).toBeGreaterThanOrEqual(4.5)
    for (const fill of [dark.primary, dark.danger]) {
      expect(contrast(dark.onColor, fill)).toBeGreaterThanOrEqual(3.9)
      expect(contrast(fill, dark.surface)).toBeGreaterThanOrEqual(3.9)
    }
  })
})

describe("a switch while the app is open", () => {
  const base = { started: "light" as const, current: "dark" as const, workdayOpen: false, keyboardOpen: false }

  it("does nothing while the phone keeps the theme the app started in", () => {
    expect(colorSchemeReloadDecision({ ...base, current: "light" })).toBe("none")
  })

  it("restarts at once on a manager's phone or outside the workday", () => {
    expect(colorSchemeReloadDecision(base)).toBe("reload")
  })

  /** Phones turn dark by themselves in the evening, mid-route. */
  it("waits for the next start while the workday is recorded", () => {
    expect(colorSchemeReloadDecision({ ...base, workdayOpen: true })).toBe("wait")
  })

  it("waits for the keyboard to go down", () => {
    expect(colorSchemeReloadDecision({ ...base, keyboardOpen: true })).toBe("wait")
  })
})

describe("the wiring", () => {
  it("starts the watch once, with the app", () => {
    expect(read("src/runtime/AndroidApp.tsx")).toContain("useEffect(() => startColorSchemeReload(), [])")
    const service = read("src/services/color-scheme-reload.ts")
    expect(service).toContain("Appearance.addChangeListener(check)")
    expect(service).toContain('Keyboard.addListener("keyboardDidHide", check)')
    expect(service).toContain("useWorkdayStore.getState().activeWorkday !== null")
  })

  it("restarts the JS from the native side, and lets Android not darken the app twice", () => {
    expect(read("android/app/src/main/java/com/mtmobileapp/FieldAppearanceModule.kt")).toContain('application.reactHost?.reload("phone colour scheme changed")')
    expect(read("android/app/src/main/java/com/mtmobileapp/PresentationFilesPackage.kt")).toContain("FieldAppearanceModule(reactContext),")
    expect(read("android/app/src/main/res/values/styles.xml")).toContain('<item name="android:forceDarkAllowed">false</item>')
    // The activity keeps running through a theme switch; the JS decides.
    expect(read("android/app/src/main/AndroidManifest.xml")).toContain("|uiMode")
  })

  it("keeps the status bar icons light on the night palette, and the navigator in its colours", () => {
    expect(read("src/components/LightScreenStatusBar.tsx")).toContain('if (fieldColorScheme === "dark") return null')
    const navigator = read("src/navigation/AppNavigatorAndroidV2.tsx")
    expect(navigator).toContain("<NavigationContainer theme={NAVIGATION_THEME}>")
    expect(navigator).toContain("background: fieldTheme.color.canvas")
  })
})

/**
 * A literal colour in a StyleSheet stays light in the night palette. The
 * tabs of both shells and the parts every screen shares take theirs from
 * fieldTheme; the two kept on purpose are named.
 */
describe("the main screens take every colour from the palette", () => {
  const FILES = [
    "src/screens/today/TodayScreen.tsx",
    "src/screens/week/WeekScreen.tsx",
    "src/screens/tasks/TasksScreen.tsx",
    "src/screens/base/RouteBaseScreen.android.tsx",
    "src/screens/more/MoreScreen.tsx",
    "src/screens/more/NotificationsScreen.tsx",
    "src/screens/manager/ManagerWorkspaceScreen.android.tsx",
    "src/screens/manager/ManagerPlanningCalendarScreen.android.tsx",
    "src/screens/manager/ManagerTeamMessageScreen.android.tsx",
    "src/screens/attendance/AttendanceWorkdayScreen.tsx",
    "src/screens/profile/ProfileScreen.tsx",
    "src/components/SyncStatusChip.tsx",
    "src/components/ConfirmSheet.tsx",
    "src/components/NotificationBell.tsx",
    "src/components/ErrorBoundary.tsx",
    "src/navigation/AppNavigatorAndroidV2.tsx",
  ]
  /** The chip on a green header of the legacy dashboard; the WhatsApp mark is white by brand. */
  const KEPT = ["chipInverse:", "whatsappMark:"]

  it("has no colour literal in their styles", () => {
    const found: string[] = []
    for (const file of FILES) {
      read(file).split("\n").forEach((line, index) => {
        if (/(?:olor|Color)\s*:\s*"(?:#|rgb)/.test(line) && !KEPT.some((kept) => line.includes(kept))) found.push(`${file}:${index + 1}`)
      })
    }
    expect(found).toEqual([])
  })
})
