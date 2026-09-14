import fs from "fs"
import path from "path"
import az from "../../src/i18n/locales/az.json"
import en from "../../src/i18n/locales/en.json"
import ru from "../../src/i18n/locales/ru.json"

/**
 * Owner request 2026-09-14: the customer signs with a finger on the tablet;
 * optional by default, required only when a manager sets it for the visit.
 * Both places an agent runs a visit — «Marşrut» and «Ziyarətlər» — offer the
 * signature and hold check-out while a required one is missing.
 */
const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../../src", file), "utf8")
const route = read("screens/route/RouteScreen.tsx")
const visits = read("screens/visit/VisitScreen.tsx")
const pad = read("components/SignaturePadModal.tsx")

describe("customer signature on visit screens", () => {
  it.each([["route", route], ["visits", visits]])("%s screen offers the pad and guards check-out", (_name, source) => {
    expect(source).toContain("useVisitSignature(activeVisit)")
    expect(source).toContain("<SignaturePadModal")
    const guard = source.slice(source.indexOf("const handleCheckOut = () => {"), source.indexOf("setNotesVisible(true)", source.indexOf("const handleCheckOut = () => {")))
    expect(guard).toContain("signature.blocksCheckOut")
    expect(guard).toContain("signature.openPad")
  })

  it("the pad is drawn without a scroll around it", () => {
    expect(pad).not.toContain("<ScrollView")
    expect(pad).toContain("scrollEnabled={false}")
    expect(pad).toContain("touch-action:none")
    expect(pad).toContain("signatureCaptureFromStrokes")
  })

  it("has the signature copy in all three languages", () => {
    const keys = ["title", "hint", "clear", "save", "requiredTitle", "requiredBody", "signNow", "savedTitle", "saveFailed", "taken", "buttonRequired", "signerNamePlaceholder"]
    const missing = [["az", az], ["en", en], ["ru", ru]].flatMap(([lang, dict]: any) =>
      keys.filter((key) => typeof dict.signature?.[key] !== "string" || !dict.signature[key].trim()).map((key) => `${lang}.${key}`)
      .concat(typeof dict.visitWorkspace?.actionSignature === "string" ? [] : [`${lang}.visitWorkspace.actionSignature`]))
    expect(missing).toEqual([])
  })

  it("the out-of-zone answer names an action, not «override»", () => {
    const texts = [az, en, ru].flatMap((dict: any) => [dict.route.tooFarSupervisorBody, dict.visit.tooFarAskSupervisor])
    expect(texts.filter((text) => /override/i.test(text))).toEqual([])
    const alert = route.slice(route.indexOf("const canOverride = api.canForceCheckIn"), route.indexOf('t("route.tooFarSupervisorBody"'))
    expect(alert).toContain("handleNavigate(point)")
  })
})

describe("signature pad on a phone on its side", () => {
  it("moves the controls beside the pad when the screen is short", () => {
    expect(pad).toContain("dimensions.width > dimensions.height && dimensions.height < 560")
    const compactBranch = pad.slice(pad.indexOf("{compact ? ("), pad.indexOf(") : (", pad.indexOf("{compact ? (")))
    expect(compactBranch).toContain("{padView}")
    expect(compactBranch).toContain("{saveButton}")
    expect(pad).toContain("paddingLeft: insets.left")
    expect(pad).toContain("paddingRight: insets.right")
    // Insets of the modal's own window, not the app's: the navigation bar on
    // the right is reported only there.
    expect(pad.indexOf("<SafeAreaProvider>")).toBeGreaterThan(pad.indexOf("<Modal"))
    expect(pad).toContain("navigationBarTranslucent")
  })
})
