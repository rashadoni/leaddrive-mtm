import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { spawnSync } from "node:child_process"

const appRoot = resolve(__dirname, "../..")
const paths = ["scripts/verify-route-field-release.mjs", "package.json", "android/app/build.gradle", "src/runtime/route-field-profile.ts", "build-local.sh"]
let fixture: string

beforeEach(() => {
  fixture = mkdtempSync(join(tmpdir(), "route-field-release-"))
  for (const name of paths) {
    mkdirSync(dirname(join(fixture, name)), { recursive: true })
    copyFileSync(join(appRoot, name), join(fixture, name))
  }
})
afterEach(() => rmSync(fixture, { recursive: true, force: true }))

function check() {
  return spawnSync(process.execPath, [join(fixture, paths[0])], { encoding: "utf8", timeout: 5000 })
}
function change(name: string, from: string | RegExp, to: string) {
  const file = join(fixture, name)
  const original = readFileSync(file, "utf8")
  const changed = original.replace(from, to)
  expect(changed).not.toBe(original)
  writeFileSync(file, changed)
}

describe("release metadata gate", () => {
  it("accepts native telemetry with matching package and Android version", () => {
    expect(check().status).toBe(0)
  })
  it("still refuses package/Gradle version drift", () => {
    change("android/app/build.gradle", /versionName "[^"]+"/, 'versionName "0.0.1"')
    expect(check().status).not.toBe(0)
  })
  it("refuses metadata attributed to another application", () => {
    change("src/runtime/route-field-profile.ts", 'installedApkVersion("com.mtmobileapp")', 'installedApkVersion("com.leaddrive.attendance")')
    expect(check().status).not.toBe(0)
  })
  it("refuses reintroducing a fixed version in the JS profile", () => {
    change("src/runtime/route-field-profile.ts", /get apkVersion\(\): string\s*\{[^}]+\}/, 'apkVersion: "3.11.4+61"')
    expect(check().status).not.toBe(0)
  })
})
