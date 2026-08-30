import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), "utf8")
}

function match(source, pattern, label) {
  const found = source.match(pattern)
  if (!found?.[1]) throw new Error(`Release profile is missing ${label}`)
  return found[1]
}

function requireEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`Release profile mismatch for ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

const packageJson = JSON.parse(read("package.json"))
const gradle = read("android/app/build.gradle")
const profile = read("src/runtime/route-field-profile.ts")
const localBuild = read("build-local.sh")

if (packageJson.name !== "leaddrive-route-field") {
  throw new Error(`Unexpected package name: ${String(packageJson.name)}`)
}
if (typeof packageJson.version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(packageJson.version)) {
  throw new Error(`Invalid Route Field release version: ${String(packageJson.version)}`)
}

const applicationId = match(profile, /applicationId:\s*"([^"]+)"/, "Route Field application id")
const apkVersion = match(profile, /apkVersion:\s*"([^"]+)"/, "Route Field APK version")
const gradleNamespace = match(gradle, /namespace\s+"([^"]+)"/, "Android namespace")
const gradleApplicationId = match(gradle, /applicationId\s+"([^"]+)"/, "Android application id")
const versionCode = match(gradle, /versionCode\s+(\d+)/, "Android versionCode")
const versionName = match(gradle, /versionName\s+"([^"]+)"/, "Android versionName")

requireEqual(gradleNamespace, applicationId, "namespace")
requireEqual(gradleApplicationId, applicationId, "application id")
requireEqual(versionName, packageJson.version, "version name")
requireEqual(apkVersion, `${versionName}+${versionCode}`, "profile APK version")

if (!gradle.includes("Debug-signing fallback is disabled.")) {
  throw new Error("Release Gradle configuration must reject debug-signing fallback")
}
if (!localBuild.includes("npm run verify:release-profile")) {
  throw new Error("build-local.sh must verify the release profile before assembling")
}
if (!/excludedModules:\s*\["workforceHrm",\s*"commercial"\]/.test(profile)) {
  throw new Error("Route Field release profile must exclude HRM and commercial modules")
}

console.log(`Route Field release profile verified: ${applicationId} ${apkVersion}`)
