import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

/**
 * Field UX audit M-08 / task B13: `textTransform: "uppercase"` upper-cases
 * with the device locale, so Azerbaijani labels lost their dotted İ
 * ("KÖMƏKÇI"). Eyebrow labels are rendered as written in the translation
 * files; user-visible upper-casing goes through `src/lib/upper.ts`.
 */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) sourceFiles(path, out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(path)
  }
  return out
}

describe("locale-blind upper-casing", () => {
  const root = join(__dirname, "..", "..", "src")

  it("does not use textTransform uppercase in any screen or component", () => {
    const offenders = sourceFiles(root).filter((file) => /textTransform:\s*["']uppercase["']/.test(readFileSync(file, "utf8")))
    expect(offenders.map((file) => file.slice(root.length + 1))).toEqual([])
  })

  it("does not use textTransform capitalize either", () => {
    // It raised every word of a date — «14 Sentyabr 2026, Bazar Ertəsi» on the
    // phone (2026-09-13) — and upper-cases with the device locale like the
    // uppercase transform. Sentence case goes through `upperFirst`.
    const offenders = sourceFiles(root).filter((file) => /textTransform:\s*["']capitalize["']/.test(readFileSync(file, "utf8")))
    expect(offenders.map((file) => file.slice(root.length + 1))).toEqual([])
  })

  it("does not build avatar initials with toUpperCase()", () => {
    const offenders = sourceFiles(root).filter((file) => /charAt\(0\)\.toUpperCase\(\)|slice\(0, 1\)\.toUpperCase\(\)/.test(readFileSync(file, "utf8")))
    expect(offenders.map((file) => file.slice(root.length + 1))).toEqual([])
  })
})
