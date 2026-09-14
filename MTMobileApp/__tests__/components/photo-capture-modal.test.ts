import fs from "fs"
import path from "path"
import az from "../../src/i18n/locales/az.json"
import en from "../../src/i18n/locales/en.json"
import ru from "../../src/i18n/locales/ru.json"

/**
 * Galaxy S23 in Azerbaijani, 2026-09-14: the camera said «Camera permission is
 * required to take photos», «Grant Permission», «Close», «Retake» and a purple
 * «Use Photo». Every word on this screen now comes from the translation files
 * and every color from fieldTheme; only the viewfinder stays black.
 */
const source = fs.readFileSync(path.resolve(__dirname, "../../src/components/PhotoCaptureModal.tsx"), "utf8")

/** Comments are prose (they quote the old English on purpose); scan code only. */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:"])\/\/[^\n]*/g, "$1 ")

const locales: Array<[string, any]> = [["az", az], ["ru", ru], ["en", en]]

const usedKeys = Array.from(new Set(Array.from(code.matchAll(/\bt\("([\w.]+)"\)/g), (match) => match[1])))

describe("camera screen speaks the app language", () => {
  it("uses translation keys that exist in all three languages", () => {
    expect(usedKeys.length).toBeGreaterThan(10)
    const missing = locales.flatMap(([lang, dict]) =>
      usedKeys
        .filter((key) => {
          const value = key.split(".").reduce((node: any, part) => node?.[part], dict)
          return typeof value !== "string" || !value.trim()
        })
        .map((key) => `${lang}.${key}`))
    expect(missing).toEqual([])
  })

  it("keeps the photoCapture namespace in parity across az, ru and en", () => {
    const keys = (dict: any) => Object.keys(dict.photoCapture ?? {}).sort()
    expect(keys(az).length).toBeGreaterThan(0)
    expect(keys(ru)).toEqual(keys(az))
    expect(keys(en)).toEqual(keys(az))
    // Every key in the namespace is on the screen; no dead copy to translate.
    const unused = keys(az).filter((key) => !usedKeys.includes(`photoCapture.${key}`))
    expect(unused).toEqual([])
  })

  it("does not show the English copy in Azerbaijani or Russian", () => {
    const leaked = locales
      .filter(([lang]) => lang !== "en")
      .flatMap(([lang, dict]) =>
        Object.entries(dict.photoCapture as Record<string, string>)
          .filter(([key, value]) => value === (en as any).photoCapture[key])
          .map(([key]) => `${lang}.${key}`))
    expect(leaked).toEqual([])
    expect(az.photoCapture.usePhoto).not.toMatch(/use photo/i)
  })

  it("has no hardcoded English words left in the component", () => {
    const oldCopy = [
      "Camera permission is required to take photos",
      "Grant Permission",
      "No camera device found",
      "Failed to capture photo",
      "Use Photo",
      // As rendered text only: `handleRetake` and `onClose` are code.
      ">Retake<",
      "Flash:",
      ">Cancel<",
      ">Close<",
      "\"Error\"",
    ]
    expect(oldCopy.filter((text) => code.includes(text))).toEqual([])
    // Every <Text> renders an expression, never a literal: once the t("key")
    // calls and compared values (flash === "on") are taken out, no quote may
    // remain, so neither `Close` nor {"Close"} nor {flag ? t("a") : "Close"}
    // gets through.
    const literalTexts = Array.from(code.matchAll(/<Text\b[^>]*>([\s\S]*?)<\/Text>/g), (match) => match[1].trim())
      .filter((children) => {
        if (!/^\{[\s\S]*\}$/.test(children)) return true
        const withoutKeys = children
          .replace(/\bt\("[\w.]+"\)/g, "")
          .replace(/[!=]==\s*"[^"\n]*"/g, "")
        return /["'`]/.test(withoutKeys) || /\.message\b/.test(withoutKeys)
      })
    expect(literalTexts).toEqual([])
    // The failed-shot message: title AND body are both t() calls. The native
    // error text used to be the body (English, technical), and a check on the
    // title alone would let `e?.message || t("…body")` come back unnoticed.
    expect(code).toContain("<Text style={styles.captureFailedTitle}>{t(\"photoCapture.captureFailedTitle\")}</Text>")
    expect(code).toContain("<Text style={styles.captureFailedBody}>{t(\"photoCapture.captureFailedBody\")}</Text>")
    // The exception text may reach the log, never the agent's screen.
    const withoutLogs = code.replace(/console\.(warn|error|log)\([^\n]*/g, " ")
    expect(withoutLogs.match(/\.message\b/g)).toBeNull()
    // Screen-reader labels are a single t() call, nothing glued on.
    const labels = code.match(/accessibilityLabel=/g) ?? []
    const translatedLabels = code.match(/accessibilityLabel=\{t\("[\w.]+"\)\}/g) ?? []
    expect(translatedLabels).toHaveLength(labels.length)
  })
})

describe("camera screen uses brand colors", () => {
  it("has no purple and no color outside fieldTheme except the black viewfinder", () => {
    expect(source).not.toMatch(/#(6366F1|4F46E5|7C3AED|8B5CF6|6D28D9|6C63FF|0B0B1E)\b/i)
    const hexColors = Array.from(new Set(code.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []))
    expect(hexColors).toEqual(["#000000"])
    expect(code).toContain("backgroundColor: VIEWFINDER_BLACK")
  })

  it("draws «Fotonu saxla» as the filled primary button and «Yenidən çək» outlined", () => {
    const pressableWith = (marker: string) => {
      const at = code.indexOf(marker)
      expect(at).toBeGreaterThan(-1)
      return code.slice(code.lastIndexOf("<Pressable", at), code.indexOf("</Pressable>", at))
    }
    const retake = pressableWith("onPress={handleRetake}")
    const usePhoto = pressableWith("onPress={handleUsePhoto}")
    expect(retake).toContain("styles.secondaryButton")
    expect(retake).toContain("t(\"photoCapture.retake\")")
    expect(usePhoto).toContain("styles.primaryButton")
    expect(usePhoto).toContain("t(\"photoCapture.usePhoto\")")
    expect(code).toMatch(/primaryButton: \{[^}]*backgroundColor: fieldTheme\.color\.primary,/)
    expect(code).toMatch(/primaryText: \{[^}]*color: fieldTheme\.color\.onColor/)
    expect(code).toMatch(/secondaryButton: \{[^}]*borderColor: fieldTheme\.color\.primary,/)
  })
})

describe("camera screen on a phone on its side", () => {
  it("measures the modal's own window and keeps controls inside every inset", () => {
    // Galaxy S23 landscape: 45 dp camera cutout on one side, navigation bar on
    // the other. The root provider reports 0 there (see SignaturePadModal).
    expect(code.indexOf("<SafeAreaProvider>")).toBeGreaterThan(code.indexOf("<Modal"))
    expect(code).toContain("navigationBarTranslucent")
    expect(code).toContain("const insets = useSafeAreaInsets()")
    for (const side of ["insets.top", "insets.bottom", "insets.left", "insets.right"]) {
      expect(code).toContain(side)
    }
    // No bar pinned at a fixed distance from the physical edge any more.
    expect(code).not.toMatch(/\b(top|bottom): 50\b/)
  })

  it("lets the permission screen scroll as one page instead of clipping", () => {
    expect(code).toContain("<ScrollView contentContainerStyle={[styles.infoContent, edges]}>")
    expect(code).toMatch(/infoContent: \{[^}]*flexGrow: 1/)
  })
})

describe("a photo leaves the camera only after «Fotonu saxla»", () => {
  it("reports a photo from exactly one place, the preview's confirm button", () => {
    // Investigated 2026-09-14: «Bağla» on the preview seemed to leave the visit
    // counter up. Only handleUsePhoto calls onPhotoTaken; Close, back and
    // Retake drop the preview. The counter moves only in the screens' upload.
    const calls = code.match(/onPhotoTaken\(/g) ?? []
    expect(calls).toHaveLength(1)
    const usePhoto = code.slice(code.indexOf("const handleUsePhoto = () => {"), code.indexOf("const handleAllow"))
    expect(usePhoto).toContain("onPhotoTaken(previewPath)")
    const capture = code.slice(code.indexOf("const handleCapture = async () => {"), code.indexOf("const handleRetake"))
    expect(capture).not.toContain("onPhotoTaken")
  })

  it("drops a shot that was still being processed when the camera closed", () => {
    // The screen mounts only while visible, so a late result cannot surface as
    // a preview on the next opening, and a rejected shot does not alert.
    expect(code).toContain("if (!props.visible) return null")
    const capture = code.slice(code.indexOf("const handleCapture = async () => {"), code.indexOf("const handleRetake"))
    expect(capture.indexOf("if (!mounted.current) return")).toBeGreaterThan(-1)
    expect(capture.indexOf("if (!mounted.current) return")).toBeLessThan(capture.indexOf("setPreviewPath(finalPath)"))
    expect(capture.indexOf("setCaptureFailed(true)")).toBeGreaterThan(-1)
    expect(capture.lastIndexOf("if (!mounted.current) return")).toBeLessThan(capture.indexOf("setCaptureFailed(true)"))
  })

  it("sends a refused permission to Settings instead of a button that does nothing", () => {
    expect(code).toContain("setPermissionDenied(true)")
    expect(code).toContain("Linking.openSettings()")
    expect(code).toContain("t(\"permission.openSettings\")")
  })
})

describe("a failed shot is said on the camera screen, not in a system dialog", () => {
  // 2026-09-14: the app's messages left Android's grey dialog for the app's
  // own notice layer. That layer sits in the app window, and this modal is a
  // window of its own above it, so a notice raised here would be hidden. The
  // camera says it inline, in the error notice's colours, over the viewfinder.
  it("draws no system dialog and no app notice from the camera", () => {
    expect(code).not.toMatch(/\bAlert\b/)
    expect(code).not.toContain("notify(")
  })

  it("shows the message only on the viewfinder and clears it on the next shot or a tap", () => {
    const capture = code.slice(code.indexOf("const handleCapture = async () => {"), code.indexOf("const handleRetake"))
    expect(capture.indexOf("setCaptureFailed(false)")).toBeGreaterThan(-1)
    expect(capture.indexOf("setCaptureFailed(false)")).toBeLessThan(capture.indexOf("camera.current.takePhoto"))
    expect(code).toContain("onPress={() => setCaptureFailed(false)}")
    // Between the live <Camera> and the shutter bar: the preview never shows it.
    const viewfinder = code.slice(code.indexOf("ref={camera}"), code.indexOf("styles.bottomBar"))
    expect(code.indexOf("ref={camera}")).toBeGreaterThan(code.indexOf("{previewPath ? ("))
    expect(viewfinder).toContain("{captureFailed ? (")
    expect(code.match(/\{captureFailed \? \(/g)).toHaveLength(1)
  })

  it("keeps the message clear of the insets and above the shutter", () => {
    const frame = code.slice(code.indexOf("{captureFailed ? ("), code.indexOf("styles.bottomBar"))
    expect(frame).toContain("bottom: insets.bottom + fieldTheme.space.xl + CAPTURE_BUTTON_SIZE + fieldTheme.space.md")
    expect(frame).toContain("left: insets.left + fieldTheme.space.lg")
    expect(frame).toContain("right: insets.right + fieldTheme.space.lg")
    expect(code).toContain("width: CAPTURE_BUTTON_SIZE,")
    expect(code).toMatch(/captureFailed: \{[^}]*backgroundColor: FEEDBACK_TONE_COLORS\.error\.background,/)
    expect(code).toContain('accessibilityRole="alert"')
  })
})
