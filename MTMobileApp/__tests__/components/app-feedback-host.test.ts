import fs from "fs"
import path from "path"
import { fieldTheme } from "../../src/theme/fieldTheme"
import { NAV_RAIL_WIDTH } from "../../src/theme/layoutBreakpoints"
import { FEEDBACK_TONE_COLORS } from "../../src/components/feedback-tone"
import {
  APP_CHOICE_MAX_WIDTH,
  appChoiceLayout,
  choiceButtonLook,
  noticeFrame,
  orderChoiceButtons,
} from "../../src/components/app-choice-layout"

/**
 * Route tab, 2026-09-14: «Giriş yadda saxlanıldı» came in Android's dark grey
 * dialog with a teal «OK», and the owner asked twice why the app's message
 * looks like a system window. The app's own notice and choice sheet replace
 * it; these are the rules that keep them the app's and keep them on screen on
 * a phone held sideways (823×384 dp, cutout on one side, nav bar on the other).
 */

const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../../src", file), "utf8")
const host = read("components/AppFeedbackHost.tsx")
const toast = read("components/FeedbackToast.tsx")
const tones = read("components/feedback-tone.ts")
const androidApp = read("runtime/AndroidApp.tsx")

function luminance(color: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe("the app's notice and choice wear fieldTheme", () => {
  it("writes no colour by hand in the host, the tone table or the visit toast", () => {
    for (const source of [host, toast, tones]) {
      expect(source.match(/#[0-9a-f]{3,8}\b/gi)).toBeNull()
      expect(source.match(/rgba?\(/gi)).toBeNull()
      expect(source).toContain("fieldTheme")
    }
    expect(toast).toContain("FEEDBACK_TONE_COLORS[type]")
  })

  it("maps every tone to the theme's soft fill and accent", () => {
    expect(FEEDBACK_TONE_COLORS.success.background).toBe(fieldTheme.color.primarySoft)
    expect(FEEDBACK_TONE_COLORS.success.accent).toBe(fieldTheme.color.primary)
    expect(FEEDBACK_TONE_COLORS.error.background).toBe(fieldTheme.color.dangerSoft)
    expect(FEEDBACK_TONE_COLORS.error.accent).toBe(fieldTheme.color.danger)
    expect(FEEDBACK_TONE_COLORS.warning.background).toBe(fieldTheme.color.amberSoft)
    expect(FEEDBACK_TONE_COLORS.warning.accent).toBe(fieldTheme.color.amber)
    expect(FEEDBACK_TONE_COLORS.info.background).toBe(fieldTheme.color.blueSoft)
    expect(FEEDBACK_TONE_COLORS.info.accent).toBe(fieldTheme.color.blue)
  })

  it("keeps the notice text readable on every tone", () => {
    expect(host).toContain("noticeTitle: { fontSize: 16, lineHeight: 21, fontWeight: \"800\", color: fieldTheme.color.ink }")
    expect(host).toContain("noticeMessage: { fontSize: 15, lineHeight: 20, color: fieldTheme.color.ink }")
    const weak = Object.entries(FEEDBACK_TONE_COLORS)
      .filter(([, tone]) => contrast(fieldTheme.color.ink, tone.background) < 4.5 || contrast(tone.accent, tone.background) < 3)
      .map(([name]) => name)
    expect(weak).toEqual([])
  })

  it("gives the sheet's filled buttons readable text", () => {
    expect(contrast(fieldTheme.color.onColor, fieldTheme.color.primary)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(fieldTheme.color.onColor, fieldTheme.color.danger)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(fieldTheme.color.ink, fieldTheme.color.surfaceStrong)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(fieldTheme.color.primary, fieldTheme.color.surface)).toBeGreaterThanOrEqual(4.5)
  })

  it("never upper-cases a label", () => {
    expect(host).not.toContain("toUpperCase")
    expect(host).not.toContain("textTransform")
  })
})

describe("one host for the whole app", () => {
  it("is mounted in the Android root after the navigator, outside the error boundary", () => {
    const tree = androidApp.slice(androidApp.indexOf("<SafeAreaProvider>"), androidApp.indexOf("</SafeAreaProvider>"))
    expect(androidApp).toContain('import AppFeedbackHost from "../components/AppFeedbackHost"')
    expect(tree.match(/<AppFeedbackHost \/>/g)).toHaveLength(1)
    expect(tree.indexOf("</ErrorBoundary>")).toBeLessThan(tree.indexOf("<AppFeedbackHost />"))
  })

  it("draws the store, not screen state", () => {
    expect(host).toContain('from "../services/app-feedback"')
    expect(host).toContain("useStore(appFeedbackStore")
    expect(host).toContain("export function AppNoticeLayer()")
  })
})

describe("the notice", () => {
  it("announces itself, closes on a tap and waits while a choice is open", () => {
    const layer = host.slice(host.indexOf("export function AppNoticeLayer()"), host.indexOf("function AppChoiceSheet()"))
    expect(layer).toContain('accessibilityLiveRegion="polite"')
    expect(layer).toContain('accessibilityHint={t("appFeedback.dismissNotice")}')
    expect(layer).toContain("onPress={() => leave(notice.id)}")
    expect(layer).toContain("if (!notice || choiceOpen) return null")
    expect(layer).toContain('pointerEvents="box-none"')
  })

  it("lies below the status bar and right of the navigation rail", () => {
    const insets = { top: 24, left: 45, right: 48 }
    expect(noticeFrame({ width: 823, insets, gap: 12 })).toEqual({ top: 36, left: 45 + NAV_RAIL_WIDTH + 12, right: 60 })
    expect(noticeFrame({ width: 390, insets: { top: 30, left: 0, right: 0 }, gap: 12 })).toEqual({ top: 42, left: 12, right: 12 })
  })

  it("is not stretched across a wide window", () => {
    expect(host).toContain("noticeMotion: { width: \"100%\", maxWidth: APP_CHOICE_MAX_WIDTH }")
    expect(APP_CHOICE_MAX_WIDTH).toBeLessThanOrEqual(560)
  })
})

describe("the choice sheet", () => {
  const sheet = host.slice(host.indexOf("function AppChoiceSheet()"), host.indexOf("const styles = StyleSheet.create("))

  it("measures insets of its own window, where the navigation bar can be on the side", () => {
    const modal = sheet.slice(sheet.indexOf("<Modal"), sheet.indexOf("</Modal>"))
    expect(modal).toContain("statusBarTranslucent")
    expect(modal).toContain("navigationBarTranslucent")
    expect(modal).toContain("<SafeAreaProvider>")
    expect(sheet).toContain("paddingLeft: insets.left + fieldTheme.space.lg")
    expect(sheet).toContain("paddingRight: insets.right + fieldTheme.space.lg")
    expect(sheet).toContain("paddingBottom: insets.bottom + fieldTheme.space.md")
    expect(sheet).toContain("paddingTop: insets.top + fieldTheme.space.md")
  })

  it("closes with the back button and a tap outside, as a dismissal", () => {
    expect(sheet).toContain("onRequestClose={() => {\n        if (choice) dismissChoice(choice.id)")
    expect(sheet).toContain("onPress={() => dismissChoice(choice.id)}")
    expect(sheet).toContain("onPress={() => answerChoice(choice.id, index)}")
  })

  it("scrolls the whole sheet as one page, never a frame inside it", () => {
    expect(sheet.match(/<ScrollView\s/g)).toHaveLength(1)
    expect(host).toContain("page: { flexGrow: 1 }")
    expect(host).not.toContain("maxHeight")
  })

  it("puts buttons side by side on a phone held sideways and a tablet", () => {
    expect(appChoiceLayout(823, 384, 3)).toEqual({ short: true, row: true })
    expect(appChoiceLayout(1280, 800, 3)).toEqual({ short: false, row: true })
    expect(appChoiceLayout(390, 844, 2)).toEqual({ short: false, row: true })
    expect(appChoiceLayout(390, 844, 3)).toEqual({ short: false, row: false })
    expect(appChoiceLayout(320, 640, 2)).toEqual({ short: false, row: false })
  })

  it("keeps every button a full touch target", () => {
    expect(host).toContain("minHeight: APP_CHOICE_BUTTON_MIN_HEIGHT")
    const button = host.slice(host.indexOf("  button: {"), host.indexOf("}", host.indexOf("  button: {")))
    expect(button).toContain("minHeight: APP_CHOICE_BUTTON_MIN_HEIGHT")
  })

  it("offers the way back first and fills exactly one action", () => {
    const ordered = orderChoiceButtons([
      { text: "Report", style: "default" as const },
      { text: "Cancel", style: "cancel" as const },
      { text: "Open maps", style: "default" as const },
    ])
    expect(ordered.map((entry) => [entry.button.text, entry.index])).toEqual([["Cancel", 1], ["Report", 0], ["Open maps", 2]])
    const looks = ordered.map((entry, position) => choiceButtonLook(entry.button.style, position === ordered.length - 1))
    expect(looks).toEqual(["quiet", "outline", "primary"])
    expect(choiceButtonLook("destructive", true)).toBe("danger")
    expect(choiceButtonLook("destructive", false)).toBe("danger")
    // In a column the reversed direction puts the filled action on top and the
    // way back at the bottom.
    expect(host).toContain('actionsColumn: { flexDirection: "column-reverse" }')
  })
})
