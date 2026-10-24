import AsyncStorage from "@react-native-async-storage/async-storage"
import { AppState, Linking } from "react-native"
import { ask } from "./app-feedback"
import { i18n } from "../i18n/index.android"
import { parseTimeAppLatest, shouldAskTimeUpdate, timeUpdateOffer, TIME_APP_LATEST_URL, TIME_APP_PACKAGE } from "./time-app-update-policy"

const LAST_ASKED_KEY = "@leaddrive_time_update_asked_v1"
let running: Promise<void> | null = null

async function readLastAsked(): Promise<{ versionCode: number; at: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_ASKED_KEY)
    const value = raw ? JSON.parse(raw) : null
    return value && Number.isSafeInteger(value.versionCode) && value.versionCode > 0 && Number.isFinite(value.at) ? value : null
  } catch {
    return null
  }
}

/** Fire-and-forget from the Time runtime. No auth, location, queue writes,
 * installer permission or automatic installation; offline/failure stays quiet. */
export function checkTimeAppUpdate(options: { coldStart: boolean; isCurrent?: () => boolean }): Promise<void> {
  if (running) return running
  const active = () => AppState.currentState === "active" && (options.isCurrent?.() ?? true)
  const task = (async () => {
    try {
      if (!active()) return
      const DeviceInfo = require("react-native-device-info").default
      if (DeviceInfo.getBundleId() !== TIME_APP_PACKAGE) return
      const installedCode = Number(DeviceInfo.getBuildNumber())
      if (!Number.isSafeInteger(installedCode) || installedCode <= 0) return
      // A native read failure must not misclassify a Play install as an APK.
      const installer: string | null = await DeviceInfo.getInstallerPackageName()
      if (installer !== null && typeof installer !== "string") return
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10_000)
      let latest = null
      try {
        const response = await fetch(TIME_APP_LATEST_URL, { signal: controller.signal, headers: { Accept: "application/json" } })
        latest = response.ok ? parseTimeAppLatest(await response.json()) : null
      } finally {
        clearTimeout(timer)
      }
      const offer = timeUpdateOffer({ installedCode, installer, latest })
      if (!offer || !active()) return
      const lastAsked = await readLastAsked()
      if (!active() || !shouldAskTimeUpdate({ coldStart: options.coldStart, now: Date.now(), lastAsked, versionCode: offer.versionCode })) return
      await AsyncStorage.setItem(LAST_ASKED_KEY, JSON.stringify({ versionCode: offer.versionCode, at: Date.now() })).catch(() => {})
      if (!active()) return
      const choice = await ask<"update" | "later">({
        title: i18n.t("timeAppUpdate.title"),
        message: i18n.t(offer.delivery === "play" ? "timeAppUpdate.messagePlay" : "timeAppUpdate.messageApk", { version: offer.versionName }),
        tone: "info",
        buttons: [
          { text: i18n.t("timeAppUpdate.later"), value: "later", style: "cancel" },
          { text: i18n.t(offer.delivery === "play" ? "timeAppUpdate.openPlay" : "timeAppUpdate.download"), value: "update" },
        ],
        dismissValue: "later",
      })
      if (choice === "update" && active()) await Linking.openURL(offer.url)
    } catch {
      // An unavailable release or offline device never blocks attendance.
    }
  })()
  running = task
  void task.finally(() => { if (running === task) running = null })
  return task
}
