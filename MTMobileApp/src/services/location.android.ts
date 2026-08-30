import Geolocation from "@react-native-community/geolocation"
import BackgroundService from "react-native-background-actions"
import { api } from "./api"
import { i18n } from "../i18n/index.android"

export let lastKnownPosition: {
  latitude: number
  longitude: number
  accuracy: number
  timestamp: number
} | null = null

const SEND_INTERVAL = 30_000
const MAX_ACCURACY = 50
const RETRY_DELAY = 5_000
const MAX_RETRIES = 3

// Android can keep the native service alive slightly longer than the React
// screen lifecycle. Explicitly binding every coordinate to the local workday
// keeps delayed uploads honest: they cannot accidentally become a point for a
// later shift, and the server can reject points captured after “End day”.
let activeTrackingWorkdayId: string | null = null

export function setTrackingWorkdayId(workdayId: string | null) {
  activeTrackingWorkdayId = workdayId?.trim() || null
}

const backgroundOptions = {
  taskName: "Route Field GPS Tracking",
  taskIcon: {
    name: "ic_launcher",
    type: "mipmap",
  },
  color: "#08705A",
  linkingURI: "routefield://",
  foregroundServiceType: ["location"] as Array<"location">,
  parameters: {
    delay: SEND_INTERVAL,
  },
}

async function backgroundTask(taskData: { delay?: number } | undefined) {
  const delay = taskData?.delay || SEND_INTERVAL

  Geolocation.setRNConfiguration({
    skipPermissionRequests: true,
    locationProvider: "android",
  })

  while (BackgroundService.isRunning()) {
    try {
      await pollAndSendAsync()
    } catch (error) {
      console.warn("[GPS-BG] poll failed:", error)
    }
    await sleep(delay)
  }
}

function uploadPosition(position: {
  coords: {
    latitude: number
    longitude: number
    accuracy: number | null
    speed: number | null
    heading: number | null
    altitude: number | null
  }
  timestamp: number
}): Promise<unknown> {
  const { latitude, longitude, accuracy, speed, heading, altitude } = position.coords
  const capturedAt = Number.isFinite(position.timestamp) ? position.timestamp : Date.now()
  lastKnownPosition = {
    latitude,
    longitude,
    accuracy: accuracy || 0,
    timestamp: capturedAt,
  }
  const recordedAt = new Date(capturedAt).toISOString()
  const clientLocationId = `gps-${Math.trunc(capturedAt)}-${latitude.toFixed(5)}-${longitude.toFixed(5)}`
  return api.sendLocation({
    latitude,
    longitude,
    accuracy: accuracy || undefined,
    speed: speed ? speed * 3.6 : undefined,
    heading: heading || undefined,
    altitude: altitude || undefined,
    ...(activeTrackingWorkdayId ? { workdayId: activeTrackingWorkdayId } : {}),
    recordedAt,
    clientLocationId,
  })
}

function pollAndSendAsync(retryCount = 0): Promise<void> {
  return new Promise((resolve) => {
    Geolocation.getCurrentPosition(
      (position) => {
        const { accuracy } = position.coords

        if (accuracy && accuracy > MAX_ACCURACY && retryCount < MAX_RETRIES) {
          setTimeout(() => {
            pollAndSendAsync(retryCount + 1).then(resolve)
          }, RETRY_DELAY)
          return
        }

        uploadPosition(position)
          .catch((error) => {
            if (error?.message === "SESSION_EXPIRED") stopTracking().catch(() => {})
          })
          .finally(resolve)
      },
      () => {
        if (retryCount !== 0) {
          resolve()
          return
        }

        Geolocation.getCurrentPosition(
          (position) => {
            uploadPosition(position)
              .catch((error) => {
                if (error?.message === "SESSION_EXPIRED") stopTracking().catch(() => {})
              })
              .finally(resolve)
          },
          () => resolve(),
          { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 }
        )
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 }
    )
  })
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

let foregroundIntervalId: ReturnType<typeof setInterval> | null = null

export async function startTracking() {
  if (BackgroundService.isRunning()) return

  try {
    Geolocation.setRNConfiguration({
      skipPermissionRequests: true,
      locationProvider: "android",
    })
    await BackgroundService.start(backgroundTask, {
      ...backgroundOptions,
      taskTitle: i18n.t("location.taskTitle"),
      taskDesc: i18n.t("location.taskDesc"),
    })
  } catch {
    startForegroundTracking()
  }
}

function startForegroundTracking() {
  if (foregroundIntervalId !== null) return
  pollAndSendAsync().catch(() => {})
  foregroundIntervalId = setInterval(() => {
    pollAndSendAsync().catch(() => {})
  }, SEND_INTERVAL)
}

export async function stopTracking() {
  if (BackgroundService.isRunning()) {
    try {
      await BackgroundService.stop()
    } catch {
      // The foreground fallback is stopped below even if the native service
      // already ended or Android rejected the stop call.
    }
  }

  if (foregroundIntervalId !== null) {
    clearInterval(foregroundIntervalId)
    foregroundIntervalId = null
  }
}
