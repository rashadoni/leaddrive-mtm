import fs from "fs"
import path from "path"

/**
 * Visits, the self planner, the organization explorer and the camera say
 * their messages through the app's own layer (`notify`, `ask` from
 * `services/app-feedback`), not Android's grey system dialog — the one the
 * owner saw after check-in and check-out on 2026-09-14.
 *
 * A source-text check, like the rest of the screen tests: the screens need
 * the native camera, GPS and navigation to render. What is pinned is what the
 * migration could silently break — each decision still branches on the answer
 * of the sheet, and each notice keeps its tone and title.
 */
const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../../src", file), "utf8")

/** Comments are prose (they may quote the old call); scan code only. */
const codeOf = (source: string) => source
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:"])\/\/[^\n]*/g, "$1 ")

const FILES = {
  visit: "screens/visit/VisitScreen.tsx",
  planning: "screens/planning/PlanningWorkspaceCore.android.tsx",
  organizations: "screens/base/OrganizationExplorerScreen.tsx",
  camera: "components/PhotoCaptureModal.tsx",
}

const visit = codeOf(read(FILES.visit))
const planning = codeOf(read(FILES.planning))
const organizations = codeOf(read(FILES.organizations))

const between = (source: string, start: string, end: string) => {
  const from = source.indexOf(start)
  expect(from).toBeGreaterThan(-1)
  const to = source.indexOf(end, from + start.length)
  expect(to).toBeGreaterThan(from)
  return source.slice(from, to)
}

/** `tone title` of every notify() call, in source order. */
const notices = (source: string) =>
  Array.from(source.matchAll(/notify\(\{\s*tone: "(\w+)",\s*title: ([^,\n]+),/g), (match) => `${match[1]} ${match[2].trim()}`)

describe("no system dialog left in the migrated screens", () => {
  it.each(Object.entries(FILES))("%s calls no Alert and imports none", (_name, file) => {
    const code = codeOf(read(file))
    expect(code).not.toMatch(/\bAlert\s*\.\s*(alert|prompt)\s*\(/)
    const imports = Array.from(code.matchAll(/import\s*\{([^}]*)\}\s*from\s*"react-native"/g), (match) => match[1])
    expect(imports.flatMap((names) => names.split(",").map((name) => name.trim().split(/\s+as\s+/)[0])).filter((name) => name === "Alert")).toEqual([])
  })
})

describe("visit screen", () => {
  it("has no toast or bottom sheet of its own any more", () => {
    expect(visit).toContain('import { ask, notify, type FeedbackTone } from "../../services/app-feedback"')
    for (const gone of ["FeedbackToast", "ConfirmSheet", "showToast", "setConfirm", "pendingGeofenceResolve"]) {
      expect(visit).not.toContain(gone)
    }
  })

  it("keeps every notice's tone and title", () => {
    expect(notices(visit).sort()).toEqual([
      "error copy.issueSuspiciousTitle",
      "error t(\"common.error\")",
      "error t(\"common.error\")",
      "error t(\"common.error\")",
      "error t(\"visit.gpsUnavailable\")",
      "error t(\"visit.tooFarTitle\")",
      "success t(\"signature.savedTitle\")",
      "success t(\"visit.checkInAcceptedTitle\")",
      "success t(\"visit.checkInQueuedTitle\")",
      "success t(\"visit.checkOutQueuedTitle\")",
      "success t(\"visit.photoQueuedTitle\")",
      "success t(\"visit.photoSavedTitle\")",
      "warning copy.issuePausedTitle",
      "warning t(\"visit.photoLimitTitle\")",
      "warning t(\"visit.photoRequiredTitle\")",
      "warning t(\"visit.syncConflictTitle\")",
      "warning t(\"visit.syncConflictTitle\")",
      "warning t(\"visit.usingLastPosition\")",
    ])
    // The same photo messages are amber on the route tab too: one tone per key.
    expect(visit).toContain('notify({ tone: "warning", title: t("visit.photoLimitTitle"), message: t("visit.photoLimitBody") })')
    expect(visit).toContain('notify({ tone: "warning", title: t("visit.photoRequiredTitle"), message: t("visit.photoRequiredBody") })')
  })

  it("asks about the signature above the pad, where a notice would be covered", () => {
    // The pad is a window of its own: «signature required» opened it in the
    // same tick as the notice, and a failed save leaves it open.
    const guard = between(visit, "if (signature.blocksCheckOut) {", "setNotesVisible(true)")
    expect(guard).not.toContain("notify(")
    expect(guard).toContain('{ text: copy.cancel, value: false, style: "cancel" }')
    expect(guard).toContain('{ text: t("signature.signNow"), value: true }')
    expect(guard).toContain("dismissValue: false")
    expect(guard).toMatch(/\.then\(\(signNow\) => \{\s*if \(signNow\) signature\.openPad\(\)\s*\}\)/)
    expect(guard.match(/signature\.openPad\(\)/g)).toHaveLength(1)

    const save = between(visit, "const handleSignatureSave = async", "const performCheckOut = async")
    const failure = save.slice(save.indexOf("} catch"))
    expect(failure).not.toContain("notify(")
    expect(failure).toContain("void ask({")
    expect(failure).toContain('message: t("signature.saveFailed")')
    expect(failure).toContain('buttons: [{ text: t("common.ok"), value: true }]')
  })

  it("forces an out-of-zone check-in only when «Check in anyway» is the answer", () => {
    const perform = between(visit, "const performCheckIn = async", "const handleCheckOut")
    const tooFar = between(perform, "if (!api.canForceCheckIn) {", "forceCheckIn = true")
    // Without the right to force, the agent is told and nothing is asked.
    expect(tooFar.indexOf("return")).toBeLessThan(tooFar.indexOf("const proceed = await ask({"))
    const choice = between(tooFar, "const proceed = await ask({", "if (!proceed) {")
    expect(choice).toContain('{ text: copy.cancel, value: false, style: "cancel" }')
    expect(choice).toContain('{ text: t("visit.checkInAnyway"), value: true, style: "destructive" }')
    expect(choice).toContain("dismissValue: false")
    const refused = between(perform, "if (!proceed) {", "forceCheckIn = true")
    expect(refused).toContain('setCheckInIssue({ kind: "too-far", distanceMeters: distance, name: customer.name })')
    expect(refused).toContain("return")
    // The visit is queued after the answer, never beside it.
    expect(perform.indexOf("const proceed = await ask({")).toBeLessThan(perform.indexOf("await queueVisitCheckIn({"))
  })

  it("starts an unplanned visit only when the prompt answers «Start»", () => {
    const prompt = between(visit, "const handleCheckIn = async (customer: Customer) => {", "const showOutcomeSheet")
    expect(prompt.indexOf("if (mutating || activeVisit || checkInStarting.current) return")).toBeGreaterThan(-1)
    expect(prompt.indexOf("if (mutating || activeVisit || checkInStarting.current) return")).toBeLessThan(prompt.indexOf("const start = await ask({"))
    expect(prompt).toContain('{ text: t("visit.checkInButton"), value: true }')
    expect(prompt).toContain("dismissValue: false")
    expect(prompt.match(/performCheckIn\(/g)).toHaveLength(1)
    expect(prompt.indexOf("if (start) await performCheckIn(customer)")).toBeGreaterThan(prompt.indexOf("const start = await ask({"))
  })

  it("does not stack a second check-in prompt on a double tap of «Start»", () => {
    // ask() queues where ConfirmSheet replaced, and `mutating` is still false
    // while the prompt is open: two prompts meant two check-ins for one customer.
    expect(visit).toContain("const checkInStarting = useRef(false)")
    const prompt = between(visit, "const handleCheckIn = async (customer: Customer) => {", "const showOutcomeSheet")
    const lock = prompt.indexOf("checkInStarting.current = true")
    expect(lock).toBeGreaterThan(prompt.indexOf("return"))
    expect(lock).toBeLessThan(prompt.indexOf("const start = await ask({"))
    // Released only after the check-in has run, and on every path.
    const release = between(prompt, "} finally {", "}")
    expect(release).toContain("checkInStarting.current = false")
    expect(prompt.indexOf("} finally {")).toBeGreaterThan(prompt.indexOf("if (start) await performCheckIn(customer)"))
  })

  it("runs an outcome's action (retry, report to manager) only when that button is pressed", () => {
    const sheet = between(visit, "const showOutcomeSheet = (", "const reportMissingCoordinates")
    // An answer to read: one button, and it stays until pressed.
    expect(sheet).toContain("if (!onConfirm) {")
    expect(sheet).toContain("buttons: [{ text: confirmText, value: true }], dismissValue: true })")
    // An answer with an action: «Cancel», back and the dim all skip it.
    expect(sheet).toContain('{ text: copy.cancel, value: false, style: "cancel" }')
    expect(sheet).toContain("dismissValue: false")
    expect(sheet).toMatch(/\.then\(\(confirmed\) => \{\s*if \(confirmed\) onConfirm\(\)\s*\}\)/)
    expect(sheet.match(/onConfirm\(\)/g)).toHaveLength(1)
    // The callers still hand over the same actions.
    expect(visit.match(/onConfirm: retry,/g)).toHaveLength(3)
    expect(visit).toContain("onConfirm: () => reportMissingCoordinates(customer)")
  })

  it("names a rejected check-in as an error and the rest as warnings", () => {
    const explain = between(visit, "const explainCheckInOutcome", "const settleCheckIn")
    for (const key of ["checkInRejectedActiveVisit", "checkInRejectedRouteMismatch", "checkInRejectedCustomerMissing"]) {
      expect(between(explain, `t("visit.${key}"`, "return")).toContain('{ tone: "error" }')
    }
    expect(between(explain, 't("visit.checkInRejectedServer"', "return")).toContain('tone: "error",')
    expect(between(visit, 't("visit.checkInRetryFailed")', "return")).toContain('tone: "error",')
    expect(between(visit, "const showOutcomeSheet = (", "if (!onConfirm)")).toContain('const tone = options.tone ?? "warning"')
  })

  it("opens Settings for a location permission refused for good only when the agent picks it", () => {
    const denied = between(visit, "PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {", "return false")
    expect(denied).toContain('{ text: t("permission.openSettings"), value: true }')
    expect(denied).toContain("dismissValue: false")
    expect(denied).toMatch(/\.then\(\(openSettings\) => \{\s*if \(openSettings\) Linking\.openSettings\(\)\s*\}\)/)
    expect(denied.match(/Linking\.openSettings\(\)/g)).toHaveLength(1)
  })
})

describe("self planner", () => {
  it("clears saved drafts only when «Clear» is the answer", () => {
    expect(planning).toContain('import { ask } from "../../services/app-feedback"')
    const confirm = between(planning, "const confirmAndSave = async () => {", "const [copying, setCopying]")
    // Nothing to clear: saves at once, nothing asked.
    const direct = between(confirm, "if (clearingWrites.length === 0) {", "}")
    expect(direct).toContain("void save()")
    expect(direct).toContain("return")
    const choice = between(confirm, "const clear = await ask({", "if (clear) void save()")
    expect(choice).toContain('{ text: t("common.cancel"), value: false, style: "cancel" }')
    expect(choice).toContain('{ text: t("common.clear"), value: true, style: "destructive" }')
    expect(choice).toContain("dismissValue: false")
    expect(confirm.match(/save\(\)/g)).toHaveLength(2)
  })
})

describe("organization explorer", () => {
  it("keeps the notices' tones and says «done» after the lists reload", () => {
    expect(notices(organizations)).toEqual([
      "error t(\"common.error\")",
      "error t(\"common.error\")",
      "success t(\"organizations.assignmentDoneTitle\")",
      "error t(\"common.error\")",
    ])
    const execute = between(organizations, "const executeAssignment = async () => {", "const renderRow")
    expect(execute.indexOf("await Promise.all([fetchRows(1, false), fetchConfiguration()])"))
      .toBeLessThan(execute.indexOf('title: t("organizations.assignmentDoneTitle")'))
  })

  it("shows an error raised under an open sheet inside that sheet's window", () => {
    // Save view, preview and assignment fail while their sheet is still open;
    // the sheet is a window of its own over the app's notice layer.
    const sheet = between(organizations, "function Sheet(", "function FilterSheet")
    expect(sheet.indexOf("<SafeAreaProvider>")).toBeGreaterThan(sheet.indexOf("<Modal"))
    expect(sheet.indexOf("<AppNoticeLayer />")).toBeGreaterThan(sheet.indexOf("<SafeAreaProvider>"))
    expect(sheet.indexOf("<AppNoticeLayer />")).toBeLessThan(sheet.indexOf("</SafeAreaProvider>"))
  })
})
