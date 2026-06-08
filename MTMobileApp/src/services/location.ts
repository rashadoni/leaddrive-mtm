import Geolocation from "@react-native-community/geolocation"
import BackgroundService from "react-native-background-actions"
import { api } from "./api"
import i18n from "../i18n"

export let lastKnownPosition: { latitude: number; longitude: number; accuracy: number; timestamp: number } | null = null

const SEND_INTERVAL = 30_000 // 30 seconds
const MAX_ACCURACY = 50 // meters — reject positions worse than this
const RETRY_DELAY = 5_000 // retry after 5s if accuracy is bad
const MAX_RETRIES = 3

// --- Background Service Configuration ---
const backgroundOptions = {
  taskName: "MTM GPS Tracking",
  taskIcon: {
    name: "ic_launcher",
    type: "mipmap",
  },
  color: "#6C63FF",
  linkingURI: "mtm://",
  foregroundServiceType: ["location"] as const,
  parameters: {
    delay: SEND_INTERVAL,
  },
}

/**
 * Background task — runs in a foreground service (Android).
 * Loops forever: get GPS → send to server → sleep → repeat.
 * Survives app going to background, screen off, etc.
 */
async function backgroundTask(taskData: any) {
  const delay = taskData?.delay || SEND_INTERVAL

  console.warn("[GPS-BG] ★ Background task STARTED, delay:", delay)

  // Configure geolocation provider
  try {
    Geolocation.setRNConfiguration({
      skipPermissionRequests: true,
      locationProvider: "playServices",
    })
    console.warn("[GPS-BG] Geolocation configured OK")
  } catch (e: any) {
    console.warn("[GPS-BG] Geolocation config FAILED:", e?.message || e)
  }

  let iteration = 0

  // Infinite loop — BackgroundService manages lifecycle
  while (BackgroundService.isRunning()) {
    iteration++
    console.warn(`[GPS-BG] ── Iteration ${iteration} ──`)
    try {
      // pollAndSendAsync always resolves (never rejects) — SESSION_EXPIRED
      // is handled inside its own send-path .catch → stopTracking().
      // This outer try/catch is retained for unexpected throws only.
      await pollAndSendAsync()
    } catch (e: any) {
      console.warn("[GPS-BG] pollAndSend unexpected error:", e?.message || e)
    }

    // Sleep until next poll
    console.warn(`[GPS-BG] Sleeping ${delay / 1000}s...`)
    await sleep(delay)
  }

  console.warn("[GPS-BG] ★ Background task ENDED (isRunning=false)")
}

/**
 * Promise-based GPS poll + send to server.
 */
function pollAndSendAsync(retryCount = 0): Promise<void> {
  console.warn(`[GPS-POLL] getCurrentPosition called (retry=${retryCount})`)
  return new Promise((resolve) => {
    Geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy, speed, heading, altitude } = position.coords

        console.warn(`[GPS] Position: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}, acc=${accuracy?.toFixed(1)}m`)

        // Cache for check-in fallback
        lastKnownPosition = { latitude, longitude, accuracy: accuracy || 0, timestamp: Date.now() }

        // If accuracy too bad, retry
        if (accuracy && accuracy > MAX_ACCURACY && retryCount < MAX_RETRIES) {
          console.warn(`[GPS] Accuracy ${accuracy.toFixed(1)}m > ${MAX_ACCURACY}m, retry ${retryCount + 1}/${MAX_RETRIES}`)
          setTimeout(() => pollAndSendAsync(retryCount + 1).then(resolve), RETRY_DELAY)
          return
        }

        api
          .sendLocation({
            latitude,
            longitude,
            accuracy: accuracy || undefined,
            speed: speed ? speed * 3.6 : undefined, // m/s → km/h
            heading: heading || undefined,
            altitude: altitude || undefined,
          })
          .then(() => console.warn("[GPS] Sent OK"))
          .catch((e) => {
            if (e?.message === "SESSION_EXPIRED") {
              // Propagate so the background loop's catch can stopTracking()
              console.warn("[GPS] Send FAILED — session revoked, propagating")
              stopTracking().catch(() => {})
            } else {
              console.warn("[GPS] Send FAILED:", e?.message || e)
            }
          })
          .finally(() => resolve())
      },
      (error) => {
        console.warn("[GPS] Error:", error?.message || error?.code || error)
        // Fallback: try with low accuracy
        if (retryCount === 0) {
          Geolocation.getCurrentPosition(
            (pos) => {
              lastKnownPosition = { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy || 0, timestamp: Date.now() }
              api.sendLocation({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: pos.coords.accuracy || undefined,
                speed: pos.coords.speed ? pos.coords.speed * 3.6 : undefined,
                heading: pos.coords.heading || undefined,
                altitude: pos.coords.altitude || undefined,
              })
              .then(() => console.warn("[GPS] Fallback sent OK"))
              .catch((e) => {
                if (e?.message === "SESSION_EXPIRED") {
                  console.warn("[GPS] Fallback send FAILED — session revoked, stopping")
                  stopTracking().catch(() => {})
                } else {
                  console.warn("[GPS] Fallback send FAILED:", e?.message || e)
                }
              })
              .finally(() => resolve())
            },
            () => resolve(),
            { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
          )
        } else {
          resolve()
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    )
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// --- Foreground-only fallback (used as additional safety) ---
let foregroundIntervalId: ReturnType<typeof setInterval> | null = null

/**
 * Start GPS tracking — uses Android Foreground Service for persistent background tracking.
 * Falls back to foreground-only interval if background service fails.
 */
export async function startTracking() {
  console.warn("[GPS] startTracking called, bgRunning:", BackgroundService.isRunning())

  // Don't start twice
  if (BackgroundService.isRunning()) {
    console.warn("[GPS] Background service already running")
    return
  }

  try {
    // Configure geolocation provider
    Geolocation.setRNConfiguration({
      skipPermissionRequests: true,
      locationProvider: "playServices",
    })

    // Start background service (creates Android foreground notification)
    const backgroundOpts = {
      ...backgroundOptions,
      taskTitle: i18n.t("location.taskTitle"),
      taskDesc: i18n.t("location.taskDesc"),
    }
    console.warn("[GPS] Calling BackgroundService.start()...")
    await BackgroundService.start(backgroundTask, backgroundOpts)
    console.warn("[GPS] BackgroundService.start() resolved ✓, isRunning:", BackgroundService.isRunning())
  } catch (e: any) {
    console.warn("[GPS] Background service FAILED, falling back to foreground:", e?.message || e)
    // Fallback: foreground-only tracking
    startForegroundTracking()
  }
}

/**
 * Foreground-only fallback — used if background service fails to start.
 */
function startForegroundTracking() {
  if (foregroundIntervalId !== null) return
  // pollAndSendAsync always resolves; SESSION_EXPIRED is handled inside the
  // send-path .catch → stopTracking(). These outer .catch calls guard only
  // against truly unexpected rejections (should not occur in practice).
  pollAndSendAsync().catch((e) => {
    console.warn("[GPS-FG] Unexpected pollAndSend error:", e?.message || e)
  })
  foregroundIntervalId = setInterval(() => {
    pollAndSendAsync().catch((e) => {
      console.warn("[GPS-FG] Unexpected pollAndSend error:", e?.message || e)
    })
  }, SEND_INTERVAL)
}

/**
 * Stop all GPS tracking — background service + foreground interval.
 */
export async function stopTracking() {
  console.warn("[GPS] stopTracking called")

  // Stop background service
  if (BackgroundService.isRunning()) {
    try {
      await BackgroundService.stop()
      console.warn("[GPS] Background service stopped ✓")
    } catch (e: any) {
      console.warn("[GPS] Background service stop error:", e?.message || e)
    }
  }

  // Stop foreground fallback
  if (foregroundIntervalId !== null) {
    clearInterval(foregroundIntervalId)
    foregroundIntervalId = null
  }
}
