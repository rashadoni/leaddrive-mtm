import fs from "fs"
import path from "path"
import { fieldTheme } from "../../src/theme/fieldTheme"

/**
 * Galaxy S23, 2026-09-14: the check-out note dialog («Çıxış», «Ləğv et» /
 * «Təsdiq et») was the only generic purple and slate in a green app, and on
 * the phone held on its side the keyboard covered «Təsdiq et».
 */
const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../../src", file), "utf8")
const dialog = read("components/NotesModal.tsx")

// The generic "primary" purples of the old UI kit. fieldTheme.color.violet is
// a deliberate accent and is not on this list.
const GENERIC_PURPLE = /#(6366F1|4F46E5|7C3AED|8B5CF6|6D28D9|A78BFA|818CF8|EEF2FF|6C63FF|3730A3)\b/i

function luminance(color: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

function styleBlock(name: string): string {
  const start = dialog.indexOf(`  ${name}: {`)
  return start < 0 ? "" : dialog.slice(start, dialog.indexOf("}", start) + 1)
}

describe("check-out note dialog wears the app's colours", () => {
  it("takes every colour from fieldTheme, none written by hand", () => {
    expect(dialog).toContain('import { fieldTheme } from "../theme/fieldTheme"')
    expect(dialog.match(GENERIC_PURPLE)).toBeNull()
    expect(dialog.match(/#[0-9a-f]{3,8}\b/gi)).toBeNull()
    // A hand-typed rgb()/rgba() copy of a token passes the hex check and stays
    // behind when the theme changes; the backdrop is built from ink instead.
    expect(dialog.match(/rgba?\(/gi)).toBeNull()
    expect(styleBlock("scrim")).toContain("backgroundColor: fieldTheme.color.ink + ")
  })

  it("makes «Təsdiq et» the brand's primary button and «Ləğv et» the quiet one", () => {
    expect(styleBlock("submitButton")).toContain("backgroundColor: fieldTheme.color.primary")
    expect(styleBlock("submitText")).toContain("color: fieldTheme.color.onColor")
    expect(styleBlock("cancelButton")).toContain("backgroundColor: fieldTheme.color.surfaceStrong")
    expect(styleBlock("cancelText")).toContain("color: fieldTheme.color.ink")
    expect(contrast(fieldTheme.color.onColor, fieldTheme.color.primary)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(fieldTheme.color.ink, fieldTheme.color.surfaceStrong)).toBeGreaterThanOrEqual(4.5)
  })

  it("draws the field and text in the theme's ink, border and radii", () => {
    const input = styleBlock("input")
    expect(input).toContain("borderColor: fieldTheme.color.border")
    expect(input).toContain("color: fieldTheme.color.ink")
    expect(input).toContain("borderRadius: fieldTheme.radius.")
    expect(dialog).toContain("placeholderTextColor={fieldTheme.color.inkMuted}")
    expect(styleBlock("message")).toContain("color: fieldTheme.color.inkMuted")
    expect(styleBlock("card")).toContain("borderRadius: fieldTheme.radius.")
    expect(styleBlock("button")).toContain("borderRadius: fieldTheme.radius.")
  })

  it("gives both buttons a full touch target", () => {
    expect(styleBlock("button")).toContain("minHeight: NOTES_ACTION_MIN_HEIGHT")
    const pressables = dialog.split("<Pressable").slice(1)
    expect(pressables).toHaveLength(2)
    const unsized = pressables.filter((p) => !p.slice(0, p.indexOf("</Pressable>")).includes("[styles.button,"))
    expect(unsized).toEqual([])
  })
})

describe("check-out note dialog stays reachable on a phone on its side", () => {
  it("moves out of the keyboard's way on Android too", () => {
    // Android had `behavior={undefined}`; "padding" is the second path, zero
    // when the platform has already shrunk the window.
    expect(dialog).toContain('<KeyboardAvoidingView style={styles.scrim} behavior="padding">')
    expect(dialog).not.toContain(": undefined")
  })

  it("keeps the platform's own keyboard resize: the dialog window is not edge-to-edge", () => {
    // `navigationBarTranslucent` makes React Native's modal window edge-to-edge,
    // and Android then stops shrinking it for the keyboard (adjustResize); a
    // non-translucent modal's content view fits the keyboard by itself.
    const modal = dialog.slice(dialog.indexOf("<Modal"), dialog.indexOf("</Modal>"))
    expect(modal).not.toContain("navigationBarTranslucent")
    expect(modal).not.toContain("statusBarTranslucent")
  })

  it("keeps the keyboard's full-screen editor from covering the dialog", () => {
    // Held sideways, a keyboard app may switch to its own full-screen text
    // editor (Android extract mode, the landscape default) and hide the
    // dialog and «Təsdiq et» while the agent types.
    const field = dialog.slice(dialog.indexOf("<TextInput"), dialog.indexOf("/>", dialog.indexOf("<TextInput")))
    expect(field).toContain("disableFullscreenUI")
    expect(field).not.toContain("disableFullscreenUI={false}")
  })

  it("scrolls the whole card as one page, never the field in a frame", () => {
    const page = dialog.slice(dialog.indexOf("<ScrollView\n"), dialog.indexOf("</ScrollView>"))
    expect(page).toContain("<TextInput")
    expect(page).toContain("keyboardShouldPersistTaps=\"handled\"")
    expect(styleBlock("page")).toContain("flexGrow: 1")
    expect(styleBlock("input")).not.toContain("maxHeight")
    // One scrolling element in the JSX (the ref type `useRef<ScrollView>` is not one).
    expect(dialog.match(/<ScrollView\s/g)).toHaveLength(1)
  })

  it("shrinks the card on a short window and brings the buttons into view", () => {
    expect(dialog).toContain("notesModalLayout(width, height)")
    expect(dialog).toContain("{ minHeight: layout.inputMinHeight }")
    expect(dialog).toContain("layout.inline && styles.bodyInline")
    expect(dialog).toContain("pageRef.current?.scrollToEnd({ animated: true })")
  })

  it("measures insets of its own window, where the navigation bar can be on the side", () => {
    // The provider inside the modal measures what still overlaps this window,
    // not the app root's insets, so nothing is padded twice.
    expect(dialog).toContain("<SafeAreaProvider>")
    expect(dialog).toContain("paddingLeft: insets.left + fieldTheme.space.lg")
    expect(dialog).toContain("paddingRight: insets.right + fieldTheme.space.lg")
    expect(dialog).toContain("paddingBottom: insets.bottom + fieldTheme.space.md")
  })
})

describe("no generic purple left in the agent's shared dialogs", () => {
  // The files this change touched. The legacy iOS shell, the unmounted
  // modals and PhotoCaptureModal are outside it on purpose.
  const swept = [
    "components/NotesModal.tsx",
    "components/HintCard.tsx",
    "components/ConfirmSheet.tsx",
    "components/ErrorBoundary.tsx",
  ]

  it("has none of the old purples in the swept files", () => {
    const left = swept.filter((file) => GENERIC_PURPLE.test(read(file)))
    expect(left).toEqual([])
  })

  it("gives the defaults the brand green instead", () => {
    const sheet = read("components/ConfirmSheet.tsx")
    expect(sheet).toContain("iconColor = fieldTheme.color.primary,")
    expect(sheet).toContain('(destructive ? "#ef4444" : fieldTheme.color.primary)')
    const hint = read("components/HintCard.tsx")
    expect(hint).toContain("backgroundColor: fieldTheme.color.primarySoft")
    expect(hint).toContain("borderLeftColor: fieldTheme.color.primary")
    const boundary = read("components/ErrorBoundary.tsx")
    expect(boundary).toContain("backgroundColor: fieldTheme.color.primary")
  })
})
