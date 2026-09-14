import { readdirSync, readFileSync, statSync } from "fs"
import { join, relative, sep } from "path"

/**
 * No app message in the system dialog.
 *
 * Route tab, Galaxy S23, 2026-09-14: after check-in («Giriş yadda saxlanıldı»)
 * and check-out («Çıxış yadda saxlanıldı») Android drew its dark grey dialog
 * with a teal «OK», and the owner asked twice why the app's popup looks like a
 * system notification window. Screens say it through `notify()` and `ask()`
 * from `services/app-feedback`, drawn by the one `AppFeedbackHost`.
 *
 * Runtime permission prompts stay system UI — the OS draws those, and they do
 * not go through `Alert`.
 *
 * The allowlist only shrinks. It names the files that still call the system
 * dialog; a file that stops is removed from it in the same change (the check
 * is two-sided, a stale entry is where the next regression would hide), and
 * the list is empty when the migration is done.
 */
const ALLOWED_SYSTEM_ALERT_FILES: string[] = [
  "src/components/PhotoCaptureModal.tsx",
  "src/screens/base/OrganizationExplorerScreen.tsx",
  "src/screens/planning/PlanningWorkspaceCore.android.tsx",
  "src/screens/route/RouteScreen.tsx",
]

const APP_ROOT = join(__dirname, "..", "..")
const SRC = join(APP_ROOT, "src")

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/**
 * A WHY comment that says "this was Alert.alert(" is prose, not a call.
 * Comments and string literals go before the scan (the same stripping as the
 * StyleSheet identifier check).
 */
function stripNonCode(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``")
}

/** `Alert.alert(`, `Alert.prompt(`, and an `Alert` imported under any name. */
function usesSystemAlert(raw: string): boolean {
  const code = stripNonCode(raw)
  if (/\bAlert\s*\.\s*(alert|prompt)\s*\(/.test(code)) return true
  const reactNativeImports = raw.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']react-native["']/g)
  for (const [, names] of reactNativeImports) {
    if (names.split(",").some((name) => name.trim().split(/\s+as\s+/)[0] === "Alert")) return true
  }
  return false
}

const offenders = sourceFiles(SRC)
  .filter((file) => usesSystemAlert(readFileSync(file, "utf8")))
  .map((file) => relative(APP_ROOT, file).split(sep).join("/"))
  .sort()

describe("no system Alert for the app's own messages", () => {
  it("finds the call shape it guards against", () => {
    expect(usesSystemAlert('import { Alert } from "react-native"\nAlert.alert("a", "b")')).toBe(true)
    expect(usesSystemAlert('import { View, Alert as SystemAlert } from "react-native"')).toBe(true)
    expect(usesSystemAlert("Alert . alert(title)")).toBe(true)
    expect(usesSystemAlert("// was Alert.alert(title) before 2026-09-14\nnotify({ tone: \"success\", title })")).toBe(false)
    expect(usesSystemAlert('const help = "Alert.alert( is gone"')).toBe(false)
    expect(usesSystemAlert('import { AlertCard } from "./AlertCard"')).toBe(false)
  })

  it("calls Alert only in the files still waiting for migration", () => {
    const unexpected = offenders.filter((file) => !ALLOWED_SYSTEM_ALERT_FILES.includes(file))
    expect(unexpected).toEqual([])
  })

  it("drops a file from the allowlist once it no longer calls Alert", () => {
    const stale = ALLOWED_SYSTEM_ALERT_FILES.filter((file) => !offenders.includes(file))
    expect(stale).toEqual([])
  })
})
