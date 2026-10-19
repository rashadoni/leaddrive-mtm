/**
 * What the update question decides, without React Native: which answer of the
 * server to trust, what to offer and when to ask. Kept apart so it is tested
 * as plain functions (services/field-app-update.ts does the asking).
 */

export const FIELD_APP_LATEST_URL = "https://app.leaddrivecrm.org/api/v1/public/field-app/latest"
export const PLAY_INSTALLER = "com.android.vending"
/** After «Позже», a resumed app asks again only this much later. */
export const ASK_AGAIN_AFTER_MS = 12 * 60 * 60 * 1000

export interface FieldAppLatest {
  versionCode: number
  versionName: string
  downloadUrl: string
  storeUrl: string | null
}

const ALLOWED_URL = /^(https:\/\/app\.leaddrivecrm\.org\/|https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.mtmobileapp|market:\/\/details\?id=com\.mtmobileapp)/

/** The server's answer, or null when it is not one we can act on. */
export function parseFieldAppLatest(raw: unknown): FieldAppLatest | null {
  if (!raw || typeof raw !== "object") return null
  const value = raw as Record<string, unknown>
  const versionCode = typeof value.versionCode === "number" ? value.versionCode : NaN
  const versionName = typeof value.versionName === "string" ? value.versionName.trim() : ""
  const downloadUrl = typeof value.downloadUrl === "string" ? value.downloadUrl : ""
  const storeUrl = typeof value.storeUrl === "string" && value.storeUrl.trim() ? value.storeUrl.trim() : null
  if (!Number.isSafeInteger(versionCode) || versionCode <= 0 || !/^\d+\.\d+\.\d+$/.test(versionName)) return null
  if (!ALLOWED_URL.test(downloadUrl)) return null
  if (storeUrl !== null && !ALLOWED_URL.test(storeUrl)) return null
  return { versionCode, versionName, downloadUrl, storeUrl }
}

/** What to offer, if anything. Pure, for tests. */
export function updateOffer(input: {
  installedCode: number
  installer: string | null
  latest: FieldAppLatest | null
}): { versionName: string; versionCode: number; url: string } | null {
  const { latest } = input
  if (!latest || !Number.isFinite(input.installedCode) || latest.versionCode <= input.installedCode) return null
  if (input.installer === PLAY_INSTALLER) {
    // Installed from Google Play: the store is the only way to update it.
    return latest.storeUrl ? { versionName: latest.versionName, versionCode: latest.versionCode, url: latest.storeUrl } : null
  }
  // Once the app is on Play, everybody is sent there; until then, the APK link.
  return { versionName: latest.versionName, versionCode: latest.versionCode, url: latest.storeUrl ?? latest.downloadUrl }
}

/**
 * Whether to show the question now. Every cold start asks; a resumed app asks
 * only for a newer build than the one already declined, or half a day later.
 */
export function shouldAskNow(input: {
  coldStart: boolean
  now: number
  lastAsked: { versionCode: number; at: number } | null
  versionCode: number
}): boolean {
  if (input.coldStart || !input.lastAsked) return true
  if (input.lastAsked.versionCode !== input.versionCode) return true
  return input.now - input.lastAsked.at >= ASK_AGAIN_AFTER_MS
}
