import { readdirSync, readFileSync, statSync } from "fs"
import { join } from "path"

/**
 * Every name a StyleSheet uses must be imported or declared in its own file.
 *
 * `StyleSheet.create` runs when the module is imported, not when a screen
 * renders, so an unresolved name there is a ReferenceError at load: the screen
 * does not look wrong, it fails to appear. This is not hypothetical — the sync
 * centre shipped exactly that, with `fieldTheme.color.inkMuted` in a style and
 * no import of `fieldTheme` (audit T8). 647 green tests said nothing, because
 * the suite covers the pure modules pulled out of components and never loads
 * the components themselves.
 *
 * The first attempt at a guard was a test that imported the component. It
 * failed for an unrelated reason — the file pulls in a native geolocation
 * module jest cannot link — and mocking the whole native surface to load one
 * component buys a fragile test. The defect is static, so the check is static:
 * no mocks, no runtime, and it covers every component at once instead of the
 * one that already broke.
 */

const ROOT = join(__dirname, "..", "..", "src")

const GLOBALS = new Set([
  "Math", "Number", "JSON", "Object", "Date", "String", "Array", "Boolean",
  "RegExp", "Map", "Set", "Promise", "console", "process", "global",
  "parseInt", "parseFloat", "isNaN", "undefined", "null", "this", "require",
])

/**
 * Prose is not code: a comment saying "on 320-360 dp phones. The card grows"
 * would otherwise read as an identifier `phones`. Comments and string literals
 * are removed before anything is scanned — the first run of this check found
 * three such false hits and nothing else.
 */
function stripNonCode(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``")
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/** Root identifiers of member expressions: `a.b.c` yields `a`, never `b`. */
function memberRoots(block: string): string[] {
  const found = new Set<string>()
  const pattern = /(^|[^.\w$'"`])([A-Za-z_$][\w$]*)\s*\./g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(block)) !== null) found.add(match[2])
  return [...found]
}

function declaredNames(source: string): Set<string> {
  const names = new Set<string>()
  const importPattern = /import\s+(?:type\s+)?(?:\{([^}]*)\}|(\w+)|\*\s+as\s+(\w+))[^\n]*?from/gs
  let match: RegExpExecArray | null
  while ((match = importPattern.exec(source)) !== null) {
    if (match[1]) {
      for (const part of match[1].split(",")) {
        const name = part.trim().split(/\s+as\s+/).pop()?.trim()
        if (name) names.add(name)
      }
    }
    if (match[2]) names.add(match[2])
    if (match[3]) names.add(match[3])
  }
  for (const [, name] of source.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(name)
  }
  return names
}

describe("StyleSheet identifiers resolve at module load", () => {
  it("no style reaches for a name its file does not have", () => {
    const offenders: string[] = []
    for (const file of sourceFiles(ROOT)) {
      const source = stripNonCode(readFileSync(file, "utf8"))
      const start = source.indexOf("StyleSheet.create(")
      if (start === -1) continue
      const known = declaredNames(source)
      for (const name of memberRoots(source.slice(start))) {
        if (known.has(name) || GLOBALS.has(name)) continue
        offenders.push(`${file.slice(ROOT.length + 1)}: ${name}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
