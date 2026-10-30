export const TIME_APP_PACKAGE = "com.leaddrive.attendance"
export const TIME_APP_CHANNEL = "time-stable"
export const TIME_APP_CERTIFICATE = "d6e9a6a76bb7c12e0ed81e2094f56e356e6f0d12b07ba35a2ed6598a88cecf2b"
export const TIME_APP_LATEST_URL = "https://app.leaddrivecrm.org/api/v1/public/time-app/latest"
export const TIME_APP_DOWNLOAD_URL = "https://app.leaddrivecrm.org/time/download"
export const TIME_APP_STORE_URL = "https://play.google.com/store/apps/details?id=com.leaddrive.attendance"
export const PLAY_INSTALLER = "com.android.vending"
export const ASK_AGAIN_AFTER_MS = 12 * 60 * 60 * 1000

export interface TimeAppLatest {
  versionCode: number
  versionName: string
  downloadUrl: string
  storeUrl: string | null
}

/** Exact Time identity and destinations: even an otherwise valid Field
 * release, another Play package or a same-host Field URL is rejected. */
export function parseTimeAppLatest(raw: unknown): TimeAppLatest | null {
  if (!raw || typeof raw !== "object") return null
  const value = raw as Record<string, unknown>
  if (value.packageName !== TIME_APP_PACKAGE || value.channel !== TIME_APP_CHANNEL || value.signingCertificateSha256 !== TIME_APP_CERTIFICATE) return null
  const { versionCode, versionName, downloadUrl, storeUrl } = value
  if (typeof versionCode !== "number" || !Number.isSafeInteger(versionCode) || versionCode <= 0) return null
  if (typeof versionName !== "string" || !/^\d+\.\d+\.\d+$/.test(versionName)) return null
  if (downloadUrl !== TIME_APP_DOWNLOAD_URL || (storeUrl !== null && storeUrl !== TIME_APP_STORE_URL)) return null
  if (typeof value.apkSha256 !== "string" || !/^[0-9a-f]{64}$/.test(value.apkSha256)) return null
  return { versionCode, versionName, downloadUrl, storeUrl }
}

export function timeUpdateOffer(input: {
  installedCode: number
  installer: string | null
  latest: TimeAppLatest | null
}): { versionCode: number; versionName: string; url: string; delivery: "apk" | "play" } | null {
  const { latest, installedCode, installer } = input
  if (!latest || !Number.isSafeInteger(installedCode) || installedCode <= 0 || latest.versionCode <= installedCode) return null
  // A Play installation is never sent to an APK. Once the Time listing is
  // enabled, APK installations also use Play (after signing continuity review).
  if (installer === PLAY_INSTALLER && !latest.storeUrl) return null
  return {
    versionCode: latest.versionCode,
    versionName: latest.versionName,
    url: latest.storeUrl ?? latest.downloadUrl,
    delivery: latest.storeUrl ? "play" : "apk",
  }
}

export function shouldAskTimeUpdate(input: {
  coldStart: boolean
  now: number
  lastAsked: { versionCode: number; at: number } | null
  versionCode: number
}): boolean {
  if (input.coldStart || !input.lastAsked || input.lastAsked.versionCode !== input.versionCode) return true
  return input.now - input.lastAsked.at >= ASK_AGAIN_AFTER_MS
}
