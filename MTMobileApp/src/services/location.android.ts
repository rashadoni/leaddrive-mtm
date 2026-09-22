import Geolocation from "@react-native-community/geolocation"
import BackgroundService from "react-native-background-actions"
import { api } from "./api"
import { i18n } from "../i18n/index.android"
import {
  classifyUploadFailure,
  flushQueue,
  queuePoint,
  type QueuedPoint,
} from "./location-outbox"

export let lastKnownPosition: {
  latitude: number
  longitude: number
  accuracy: number
  timestamp: number
} | null = null

const SEND_INTERVAL = 30_000
const MAX_ACCURACY = 50

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
  linkingURI: "mtm://",
  foregroundServiceType: ["location"] as Array<"location">,
  parameters: {
    delay: SEND_INTERVAL,
  },
}

/**
 * 2026-09-22, Galaxy S23 of the owner, two days of driving and not one point:
 * the tracking notification said data was being sent, and nothing was. The
 * old loop was «ask for a fix, then `await sleep(30 s)`». `sleep` is a JS
 * timer, and React Native stops JS timers of a backgrounded app once the
 * screen goes dark — the service and its notification lived on, the loop
 * never woke. Measured on the phone: requests every 30–40 s with the screen
 * on, one more after it went off, then silence until the app was opened.
 *
 * Nothing here waits on a JS timer any more. A native subscription to the
 * network provider (Wi-Fi and cells, available indoors) delivers readings as
 * Android events, which a backgrounded app does receive. Each reading is the
 * heartbeat: when 30 s have passed since the last sent point — by the
 * readings' own clock — it asks once for a precise GPS fix, whose timeout is
 * native too, and sends the fix or, failing that, the network reading.
 */
async function backgroundTask(_taskData: { delay?: number } | undefined) {
  startWatching()
  // The foreground service lives exactly as long as this promise.
  await new Promise<void>((resolve) => {
    releaseBackgroundTask = resolve
  })
  stopWatching()
}

/** Minimum spacing between sent points, measured on the readings' clock. */
export const SEND_GAP_MS = SEND_INTERVAL
/** A reading coarser than this is not a position a manager can use. */
export const MAX_NETWORK_ACCURACY = 200

let watchId: number | null = null
let lastSentAt = 0
let heartbeatBusy = false
let heartbeatStartedAt = 0
let heartbeatGeneration = 0
let releaseBackgroundTask: (() => void) | null = null

/**
 * 2026-09-22, 16:04: the first build without the sleep loop sent four points
 * with the screen dark, then nothing. An upload's own 20 s timeout is a JS
 * timer too; with the network held by Android the request never settled, the
 * heartbeat stayed busy, and every later reading was skipped. A heartbeat busy
 * for longer than this — on the readings' clock — is abandoned.
 */
export const HEARTBEAT_STUCK_MS = 90_000

/** Whether a busy heartbeat started at `startedAt` is stuck at reading time `at`. */
export function isHeartbeatStuck(at: number, startedAt: number): boolean {
  return at - startedAt >= HEARTBEAT_STUCK_MS
}

/** Whether a reading taken at `timestamp` is due to become a point. */
export function isHeartbeatDue(timestamp: number, lastSent: number): boolean {
  return timestamp - lastSent >= SEND_GAP_MS
}

type Reading = Parameters<typeof uploadPosition>[0]

function sendReading(position: Reading) {
  lastSentAt = Number.isFinite(position.timestamp) ? position.timestamp : Date.now()
  return uploadPosition(position).catch((error) => {
    if (error?.message === "SESSION_EXPIRED") stopTracking().catch(() => {})
  })
}

function onHeartbeat(reading: Reading) {
  const at = Number.isFinite(reading.timestamp) ? reading.timestamp : Date.now()
  if (heartbeatBusy && isHeartbeatStuck(at, heartbeatStartedAt)) heartbeatBusy = false
  if (heartbeatBusy || !isHeartbeatDue(at, lastSentAt)) return
  heartbeatBusy = true
  heartbeatStartedAt = at
  // A late settle of an abandoned heartbeat must not release the current one.
  const generation = ++heartbeatGeneration
  const release = () => { if (generation === heartbeatGeneration) heartbeatBusy = false }
  const fallback = () => {
    const accuracy = reading.coords.accuracy ?? Infinity
    return accuracy <= MAX_NETWORK_ACCURACY ? sendReading(reading) : Promise.resolve()
  }
  Geolocation.getCurrentPosition(
    (fix) => {
      const precise = (fix.coords.accuracy ?? Infinity) <= MAX_ACCURACY
      ;(precise ? sendReading(fix) : fallback()).finally(release)
    },
    () => { fallback().finally(release) },
    { enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 },
  )
}

function startWatching() {
  if (watchId !== null) return
  Geolocation.setRNConfiguration({
    skipPermissionRequests: true,
    locationProvider: "android",
  })
  watchId = Geolocation.watchPosition(
    onHeartbeat,
    (error) => console.warn("[GPS-BG] watch error:", error),
    { enableHighAccuracy: false, distanceFilter: 0, interval: 10_000, fastestInterval: 5_000, maximumAge: 30_000 },
  )
}

function stopWatching() {
  if (watchId !== null) Geolocation.clearWatch(watchId)
  watchId = null
  heartbeatBusy = false
}

/**
 * Send one point, and keep it if the network refused to carry it.
 *
 * A dropped coordinate is a hole in the day that nobody can fill in
 * afterwards: the agent was somewhere, the phone knew where, and the record
 * says nothing. Android suspending the network while the phone lies still is
 * ordinary, so the point waits instead of dying. `recordedAt` and
 * `clientLocationId` travel with it — the server keeps the capture time and
 * refuses a duplicate.
 */
async function sendOrQueue(point: QueuedPoint): Promise<void> {
  try {
    await api.sendLocation(point)
  } catch (error) {
    const verdict = classifyUploadFailure(error as { message?: string; status?: number })
    if (verdict === "stop") {
      stopTracking().catch(() => {})
      return
    }
    if (verdict === "retry") await queuePoint(point)
    return
  }
  // The line is up right now: this is the moment to carry what is waiting.
  await flushQueue((queued) => api.sendLocation(queued)).catch(() => {})
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
  return sendOrQueue({
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

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

let foregroundWatching = false

// Android kills the whole app when a foreground service is stopped before it
// has posted its notification (ForegroundServiceDidNotStartInTimeException).
// `BackgroundService.start` resolves as soon as the service is requested, not
// when it is up, so a stop right after a start crashes. On a Galaxy S23 it did
// exactly that 14 ms after the notification sheet closed (2026-09-14). Every
// start and stop therefore runs in one queue, and a stop waits until the
// service has had time to come up.
const MIN_SERVICE_RUN_BEFORE_STOP_MS = 3_000
let trackingQueue: Promise<void> = Promise.resolve()
let serviceStartedAt = 0

function inTrackingQueue(step: () => Promise<void>): Promise<void> {
  const run = trackingQueue.then(step, step)
  trackingQueue = run.catch(() => {})
  return run
}

export function startTracking(): Promise<void> {
  return inTrackingQueue(async () => {
    if (BackgroundService.isRunning()) return

    try {
      Geolocation.setRNConfiguration({
        skipPermissionRequests: true,
        locationProvider: "android",
      })
      serviceStartedAt = Date.now()
      await BackgroundService.start(backgroundTask, {
        ...backgroundOptions,
        taskTitle: i18n.t("location.taskTitle"),
        taskDesc: i18n.t("location.taskDesc"),
      })
    } catch {
      serviceStartedAt = 0
      startForegroundTracking()
    }
  })
}

function startForegroundTracking() {
  if (foregroundWatching) return
  foregroundWatching = true
  startWatching()
}

export function stopTracking(): Promise<void> {
  return inTrackingQueue(async () => {
    if (BackgroundService.isRunning()) {
      const wait = serviceStartedAt + MIN_SERVICE_RUN_BEFORE_STOP_MS - Date.now()
      if (wait > 0) await sleep(wait)
    }
    releaseBackgroundTask?.()
    releaseBackgroundTask = null
    if (BackgroundService.isRunning()) {
      try {
        await BackgroundService.stop()
      } catch {
        // The foreground fallback is stopped below even if the native service
        // already ended or Android rejected the stop call.
      }
    }

    if (foregroundWatching) foregroundWatching = false
    stopWatching()
  })
}
