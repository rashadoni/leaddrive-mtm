/** Actual installed artifact identity, shared by request/push/crash telemetry. */
export function installedApkVersion(expectedApplicationId: string): string | null {
  try {
    // Existing native dependency; lazy so metadata cannot prevent app startup.
    const deviceInfo = require("react-native-device-info").default
    if (deviceInfo.getBundleId() !== expectedApplicationId) return null
    const version: unknown = deviceInfo.getVersion()
    const build: unknown = deviceInfo.getBuildNumber()
    if (typeof version !== "string" || !/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(version)) return null
    if (typeof build !== "string" || !/^[1-9]\d{0,9}$/.test(build)) return null
    const code = Number(build)
    if (!Number.isSafeInteger(code) || code > 2147483647) return null
    return `${version}+${build}`
  } catch {
    return null
  }
}
