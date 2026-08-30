import fs from "fs"
import path from "path"

const sourceRoot = path.resolve(__dirname, "../..")
const sourceExtensions = [".ts", ".tsx", ".js", ".jsx", ".json"]

function isFile(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isFile()
  } catch {
    return false
  }
}

function resolveRelativeImport(from: string, specifier: string): string | null {
  const base = path.resolve(path.dirname(from), specifier)
  const candidates = [
    base,
    ...sourceExtensions.map((extension) => `${base}${extension}`),
    ...sourceExtensions.map((extension) => path.join(base, `index${extension}`)),
  ]
  return candidates.find(isFile) ?? null
}

function reachableFiles(entry: string): Set<string> {
  const visited = new Set<string>()
  const pending = [entry]
  while (pending.length > 0) {
    const file = pending.pop()!
    if (visited.has(file)) continue
    visited.add(file)
    const source = fs.readFileSync(file, "utf8")
    const imports = [...source.matchAll(/(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g)]
      .filter((match) => {
        const statement = match[0].trimStart()
        return !statement.startsWith("import type ") && !statement.startsWith("export type ")
      })
      .map((match) => match[1])
      .filter((specifier) => specifier.startsWith("."))

    for (const specifier of imports) {
      const resolved = resolveRelativeImport(file, specifier)
      if (!resolved) {
        throw new Error(`Unresolved relative import ${specifier} from ${path.relative(sourceRoot, file)}`)
      }
      pending.push(resolved)
    }
  }
  return visited
}

describe("Route Field Android import graph", () => {
  it("does not package legacy navigator, manager transport, or a team-planning adapter", () => {
    const reachable = [...reachableFiles(path.join(sourceRoot, "App.android.ts"))]
      .map((file) => path.relative(sourceRoot, file))

    expect(reachable).not.toContain("src/navigation/AppNavigator.tsx")
    expect(reachable).not.toContain("src/services/manager-api.ts")
    expect(reachable).not.toContain("src/screens/manager/ManagerPlanningWorkspace.android.tsx")
    expect(reachable).not.toContain("src/screens/base/ContactDetailScreen.tsx")
    expect(reachable).not.toContain("src/screens/base/BaseScreen.tsx")
    expect(reachable).not.toContain("src/screens/base/OrganizationsList.tsx")
    expect(reachable).not.toContain("src/screens/base/OrganizationExplorerScreen.tsx")
  })
})
