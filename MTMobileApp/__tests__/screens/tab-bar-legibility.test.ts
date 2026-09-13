import fs from "fs"
import path from "path"
import { TAB_BAR_BASE_HEIGHT } from "../../src/hooks/useTabBarHeight"
import { mobileResources } from "../../src/i18n/mobile-resources"

/**
 * Field UX audit 2026-09-05, task B18, second half. The first half — screen
 * reader names built from an icon glyph glued to a caption — turned out to be
 * already fixed on main by sprint 1, and the "', Начать день'" symptom does
 * not reproduce. What was left is pixels: the five tab captions were set at
 * 10 px.
 *
 * Raising them is not free. Five tabs share the width, so the longest caption
 * decides, and that is Azerbaijani: "Tapşırıqlar", eleven characters.
 */
const navigator = fs.readFileSync(
  path.resolve(__dirname, "../../src/navigation/AppNavigatorAndroidV2.tsx"),
  "utf8",
)
const hook = fs.readFileSync(
  path.resolve(__dirname, "../../src/hooks/useTabBarHeight.ts"),
  "utf8",
)
const androidHook = fs.readFileSync(
  path.resolve(__dirname, "../../src/hooks/useTabBarHeight.android.ts"),
  "utf8",
)
const metrics = fs.readFileSync(
  path.resolve(__dirname, "../../src/theme/tabBarMetrics.ts"),
  "utf8",
)

describe("B18: tab captions can be read", () => {
  it("sets them at 12 px", () => {
    const label = navigator.slice(navigator.indexOf("  tabLabel: {"), navigator.indexOf("})", navigator.indexOf("  tabLabel: {")))
    expect(label).toContain("fontSize: 12")
    expect(label).not.toContain("fontSize: 10")
    // Letter-spacing bought nothing and cost about a character of room on the
    // caption that has the least to spare.
    expect(label).not.toContain("letterSpacing")
  })

  it("gives the taller line somewhere to live", () => {
    expect(navigator).toContain("const tabBarHeight = TAB_BAR_BASE_HEIGHT + Math.max(insets.bottom, 8)")
    expect(TAB_BAR_BASE_HEIGHT).toBe(63)
  })

  it("keeps the bar's height in one place", () => {
    // The hook said 56 while the navigator drew 60: every screen's last row
    // sat four points under the bar, and 12 px captions would have made it
    // seven.
    expect(metrics).toContain("export const TAB_BAR_BASE_HEIGHT = 63")
    // Both hook files — Android loads the `.android` one — read the same number.
    const drift: string[] = []
    for (const [name, source] of [["useTabBarHeight.ts", hook], ["useTabBarHeight.android.ts", androidHook]] as const) {
      if (!source.includes("return TAB_BAR_BASE_HEIGHT + Math.max(insets.bottom, 8) + 12")) drift.push(`${name}: padding not from the constant`)
      if (source.includes("return 56 +")) drift.push(`${name}: still 56`)
      if (!source.includes('from "../theme/tabBarMetrics"')) drift.push(`${name}: constant not from theme/tabBarMetrics`)
    }
    expect(drift).toEqual([])
  })

  it("imports the bar height from a module Android cannot swap out", () => {
    // Device acceptance 2026-09-13: imported from `hooks/useTabBarHeight`, the
    // constant was undefined on Android (Metro picked the `.android` twin), the
    // height became NaN and the bar collapsed to its padding.
    expect(navigator).toContain('import { TAB_BAR_BASE_HEIGHT } from "../theme/tabBarMetrics"')
    expect(navigator).not.toContain('import { TAB_BAR_BASE_HEIGHT } from "../hooks/useTabBarHeight"')
    expect(fs.existsSync(path.resolve(__dirname, "../../src/theme/tabBarMetrics.android.ts"))).toBe(false)
  })

  it("gives the caption the item's full width on a phone", () => {
    expect(navigator).toContain(": { paddingHorizontal: 2 },")
  })

  it("still has all five captions in every language", () => {
    const missing: string[] = []
    for (const locale of ["ru", "en", "az"] as const) {
      const nav = mobileResources[locale].navV2 as Record<string, string>
      for (const key of ["today", "calendar", "route", "tasks", "more"]) {
        if (typeof nav[key] !== "string" || !nav[key].trim()) missing.push(`${locale}.${key}`)
      }
    }
    expect(missing).toEqual([])
  })
})
