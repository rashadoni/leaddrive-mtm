import AsyncStorage from "@react-native-async-storage/async-storage"
import { Linking } from "react-native"
import { ask } from "./app-feedback"
import { i18n } from "../i18n/index.android"
import {
  FIELD_APP_LATEST_URL,
  parseFieldAppLatest,
  shouldAskNow,
  updateOffer,
  type FieldAppLatest,
} from "./field-app-update-policy"

/**
 * «Есть новая версия — обновить?» when the app opens (owner, 2026-10-19:
 * until Google Play accepts the organization account, agents install the APK
 * from one link, and the app itself offers each new version).
 *
 * The server says which build is newest (GET /api/v1/public/field-app/latest
 * on app.leaddrivecrm.org — always a build of main). «Обновить» opens the
 * download link; Android installs the new APK over this one, signed with the
 * same key, so unsent visits and drafts stay.
 *
 * Google Play forbids an app it delivered to update itself any other way, so
 * a copy installed from Play is never sent to an APK: only to the store, and
 * only once the server names a store address.
 */

const LAST_ASKED_KEY = "@mtm_app_update_asked_v1"

async function readLastAsked(): Promise<{ versionCode: number; at: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_ASKED_KEY)
    const value = raw ? JSON.parse(raw) : null
    return value && Number.isFinite(value.versionCode) && Number.isFinite(value.at) ? value : null
  } catch {
    return null
  }
}

let running: Promise<void> | null = null

/** Ask the server, compare, and offer the update. Never throws. */
export function checkFieldAppUpdate(options: { coldStart: boolean }): Promise<void> {
  if (running) return running
  running = (async () => {
    try {
      // Loaded here, not at the top: unit tests of screens importing this file
      // run without the native module.
      const DeviceInfo = require("react-native-device-info").default
      const installedCode = Number(DeviceInfo.getBuildNumber())
      // A build number that cannot be read (a test, a broken install) is not
      // compared with anything, and nothing is asked over the network.
      if (!Number.isSafeInteger(installedCode) || installedCode <= 0) return
      const installer: string | null = await DeviceInfo.getInstallerPackageName().catch(() => null)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10_000)
      let latest: FieldAppLatest | null = null
      try {
        const response = await fetch(FIELD_APP_LATEST_URL, { signal: controller.signal, headers: { Accept: "application/json" } })
        latest = response.ok ? parseFieldAppLatest(await response.json()) : null
      } finally {
        clearTimeout(timer)
      }
      const offer = updateOffer({ installedCode, installer, latest })
      if (!offer) return
      const lastAsked = await readLastAsked()
      if (!shouldAskNow({ coldStart: options.coldStart, now: Date.now(), lastAsked, versionCode: offer.versionCode })) return
      await AsyncStorage.setItem(LAST_ASKED_KEY, JSON.stringify({ versionCode: offer.versionCode, at: Date.now() })).catch(() => {})
      const choice = await ask<"update" | "later">({
        title: i18n.t("appUpdate.title"),
        message: i18n.t("appUpdate.message", { version: offer.versionName }),
        tone: "info",
        buttons: [
          { text: i18n.t("appUpdate.later"), value: "later", style: "cancel" },
          { text: i18n.t("appUpdate.update"), value: "update" },
        ],
        dismissValue: "later",
      })
      if (choice === "update") await Linking.openURL(offer.url)
    } catch {
      // No connection, no answer, no browser: the question waits for the next start.
    } finally {
      running = null
    }
  })()
  return running
}
