import fs from "fs"
import path from "path"

/**
 * Metro resolves `./x` to `x.android.ts(x)` on Android when that file exists;
 * Jest resolves it to `x.ts(x)`. A name exported only by the plain file is
 * therefore green in every test and `undefined` on the phone.
 *
 * That is not hypothetical: B18 exported `TAB_BAR_BASE_HEIGHT` from
 * `hooks/useTabBarHeight.ts` only. On the device (Samsung S23 Ultra,
 * 2026-09-13) the tab bar's height became NaN and the bar collapsed to its
 * padding, with every tab caption at zero height.
 *
 * This walks every twin pair in `src` and requires the Android file to export
 * at least what the plain file exports.
 */
const src = path.resolve(__dirname, "../../src")

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })
}

function exportedNames(source: string): Set<string> {
  const names = new Set<string>()
  for (const m of source.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class|type|interface|enum)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1])
  if (/export\s+default\b/.test(source)) names.add("default")
  for (const m of source.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim()
      if (name) names.add(name)
    }
  }
  return names
}

const pairs = walk(src)
  .filter((file) => /\.android\.tsx?$/.test(file))
  .flatMap((android) => {
    const base = android.replace(/\.android\.(tsx?)$/, "")
    return [".ts", ".tsx"].map((ext) => base + ext).filter((plain) => fs.existsSync(plain)).map((plain) => [plain, android] as const)
  })

describe("Android twins export what their plain files export", () => {
  it("finds the twin pairs it is meant to guard", () => {
    const names = pairs.map(([plain]) => path.relative(src, plain))
    expect(names).toContain(path.join("hooks", "useTabBarHeight.ts"))
    expect(pairs.length).toBeGreaterThanOrEqual(6)
  })

  it("leaves no name undefined on Android", () => {
    const missing: string[] = []
    for (const [plain, android] of pairs) {
      const onAndroid = exportedNames(fs.readFileSync(android, "utf8"))
      for (const name of exportedNames(fs.readFileSync(plain, "utf8"))) {
        if (!onAndroid.has(name)) missing.push(`${path.relative(src, android)} lacks ${name}`)
      }
    }
    expect(missing).toEqual([])
  })
})
