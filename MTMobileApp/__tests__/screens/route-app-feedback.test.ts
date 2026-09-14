import fs from "fs"
import path from "path"

/**
 * Route tab, Galaxy S23, 2026-09-14: «Giriş yadda saxlanıldı» and «Çıxış yadda
 * saxlanıldı» came in Android's dark grey dialog with a teal «OK», and the
 * owner asked twice why the app's popup looks like a system window. The route
 * screen now says everything through `notify()` / `ask()`.
 *
 * Every decision that used to wait on a system button still waits: a wrong
 * rewrite here does not look broken, it checks in out of zone or skips a
 * signature. So each branch is pinned to the value `ask()` resolves with,
 * including the one a back button gives (`dismissValue`).
 */
const source = fs.readFileSync(path.resolve(__dirname, "../../src/screens/route/RouteScreen.tsx"), "utf8")

const between = (from: string, to: string, text = source) => {
  const start = text.indexOf(from)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = text.indexOf(to, start + from.length)
  expect(end).toBeGreaterThan(start)
  return text.slice(start, end)
}

const checkInStart = source.indexOf("const handleCheckIn = async (point: RoutePoint) => {")
const checkIn = source.slice(checkInStart, source.indexOf("const handleCheckOut = () => {", checkInStart))

/** The object literal handed to the `ask(` call that starts at `offset`. */
function askArgument(text: string, offset: number): string {
  const open = text.indexOf("({", offset)
  let depth = 0
  for (let index = open; index < text.length; index++) {
    if (text[index] === "(") depth++
    if (text[index] === ")") depth--
    if (depth === 0) return text.slice(open, index + 1)
  }
  throw new Error("unterminated ask(")
}

const askCalls = [...source.matchAll(/\bask(<[^>]*>)?\(\{/g)].map((match) => askArgument(source, match.index ?? 0))

describe("route screen speaks through the app's own feedback layer", () => {
  it("has no system dialog left", () => {
    expect(source).not.toMatch(/\bAlert\s*\.\s*(alert|prompt)\s*\(/)
    const reactNative = source.match(/import\s*\{([^}]*)\}\s*from\s*"react-native"/)
    expect(reactNative?.[1].split(",").map((name) => name.trim())).not.toContain("Alert")
    expect(source).toContain('import { ask, notify } from "../../services/app-feedback"')
  })

  it("reports the owner's two saves as success notices", () => {
    expect(checkInStart).toBeGreaterThanOrEqual(0)
    expect(checkIn).toContain('notify({ tone: "success", title: t("visit.checkInQueuedTitle"), message: t("visit.checkInQueuedBody", { name: point.customer.name }) })')
    expect(source).toContain('notify({ tone: "success", title: t("visit.checkOutQueuedTitle"), message: t("visit.checkOutQueuedBody") })')
    expect(source).toContain('notify({ tone: "error", title: t("common.error"), message: t("visit.checkInFailed") })')
    expect(source).toContain('notify({ tone: "error", title: t("common.error"), message: t("visit.checkOutFailed") })')
  })

  it("gives the photo rules the same amber tone as the visit tab", () => {
    // Nothing failed: the limit is a rule and a missing photo is a step to take.
    expect(source).toContain('notify({ tone: "warning", title: t("visit.photoLimitTitle"), message: t("visit.photoLimitBody") })')
    expect(source).toContain('notify({ tone: "warning", title: t("visit.photoRequiredTitle"), message: t("visit.photoRequiredBody") })')
  })

  it("keeps every choice inside what the sheet can draw, with localized copy", () => {
    // noCoordinates, locationUnavailable, tooFar x2, signature required, signature save failed.
    expect(askCalls).toHaveLength(6)
    for (const call of askCalls) {
      const buttons = call.match(/\{ text: /g) ?? []
      expect(buttons.length).toBeGreaterThanOrEqual(1)
      expect(buttons.length).toBeLessThanOrEqual(3)
      expect(call).toContain("dismissValue: ")
      expect(call).toMatch(/title: t\("/)
      expect(call).not.toMatch(/text: "/)
    }
  })

  it("refuses a check-in without coordinates and shares only on «report»", () => {
    const guard = between("if (!hasUsableCoordinates(point.customer)) {", "setMutating(true)", checkIn)
    expect(guard).toContain("const report = await ask({")
    expect(guard).toContain('{ text: t("common.cancel"), value: false, style: "cancel" }')
    expect(guard).toContain('{ text: t("visit.reportToManager"), value: true }')
    expect(guard).toContain("dismissValue: false")
    expect(between("if (report) {", "return", guard)).toContain("Share.share({")
  })

  it("waits on the location sheet and then ends the attempt", () => {
    const branch = between("const cacheFresh = ", "const customerCoordinates", checkIn)
    const waited = branch.slice(branch.indexOf("await ask({"))
    expect(waited).toContain('buttons: [{ text: t("common.retry"), value: "retry" }]')
    // Nothing after the sheet uses the answer: retry and back both end here,
    // and check-in stays locked until then, as with the old awaited Promise.
    expect(waited.indexOf("setMutating(false)")).toBeGreaterThan(waited.indexOf('dismissValue: "closed"'))
    expect(waited.indexOf("return")).toBeGreaterThan(waited.indexOf("setMutating(false)"))
  })

  it("checks in out of zone only on «try anyway», and only for those allowed to", () => {
    const tooFar = between("const canOverride = api.canForceCheckIn", "forceCheckIn = true", checkIn)
    expect(tooFar).toContain("let proceed = false")
    const override = between("if (canOverride) {", "} else {", tooFar)
    expect(override).toContain("proceed = await ask({")
    expect(override).toContain('{ text: t("common.cancel"), value: false, style: "cancel" }')
    expect(override).toContain('{ text: t("route.tryAnyway"), value: true }')
    expect(override).toContain("dismissValue: false")

    // Without the right, no answer sets proceed; «Yolu aç» opens the route.
    const supervisor = between("} else {", "if (!proceed) {", tooFar)
    expect(supervisor).not.toContain("proceed =")
    expect(supervisor).toContain('const pick = await ask<"ok" | "maps">({')
    expect(supervisor).toContain('{ text: t("common.ok"), value: "ok", style: "cancel" }')
    expect(supervisor).toContain('{ text: copy.openMaps, value: "maps" }')
    expect(supervisor).toContain('dismissValue: "ok"')
    expect(supervisor).toContain('if (pick === "maps") handleNavigate(point)')

    const refusal = between("if (!proceed) {", "}", tooFar)
    expect(refusal).toContain("setMutating(false)")
    expect(refusal).toContain("return")
  })

  it("opens the signature pad only when the agent asks for it", () => {
    const guard = between("if (signature.blocksCheckOut) {", "setNotesVisible(true)")
    expect(guard).toContain('{ text: t("common.cancel"), value: false, style: "cancel" }')
    expect(guard).toContain('{ text: t("signature.signNow"), value: true }')
    expect(guard).toContain("dismissValue: false")
    expect(guard).toContain("if (signNow) signature.openPad()")
    expect(guard.indexOf("return")).toBeGreaterThan(guard.indexOf("signature.openPad()"))
  })

  it("shows a failed signature save above the pad that stays open", () => {
    const save = between("const handleSignatureSave = async", "const performCheckOut = async")
    expect(save).toContain('notify({ tone: "success", title: t("signature.savedTitle"), message: t("signature.savedBody") })')
    const failure = save.slice(save.indexOf("} catch"))
    // Not awaited: the pad's own save must not stay busy until «OK».
    expect(failure).toContain("void ask({")
    expect(failure).not.toContain("await ask(")
    expect(failure).toContain('message: t("signature.saveFailed")')
  })

  it("draws notices over the phone action sheet, which is a window of its own", () => {
    expect(source).toContain('import { AppNoticeLayer } from "../../components/AppFeedbackHost"')
    const sheet = between("<Modal visible={phonePanelVisible}", "</Modal>")
    expect(sheet).toContain("<AppNoticeLayer />")
    expect(sheet.indexOf("<AppNoticeLayer />")).toBeGreaterThan(sheet.indexOf("{actionPanel}"))
    // Its insets are the sheet window's: with the root's, the notice sat a
    // status bar lower here than everywhere else.
    expect(source).toContain('import { SafeAreaProvider } from "react-native-safe-area-context"')
    expect(sheet.indexOf("<SafeAreaProvider>")).toBeGreaterThan(-1)
    expect(sheet.indexOf("<SafeAreaProvider>")).toBeLessThan(sheet.indexOf("{actionPanel}"))
    expect(sheet.indexOf("<AppNoticeLayer />")).toBeLessThan(sheet.indexOf("</SafeAreaProvider>"))
    // Exactly one root host exists; the screen adds no second choice sheet.
    expect(source).not.toContain("<AppFeedbackHost")
  })
})
