import { NativeEventEmitter, NativeModules } from "react-native"
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
  startPositionUpdates()
  // The foreground service lives exactly as long as this promise.
  await new Promise<void>((resolve) => {
    releaseBackgroundTask = resolve
  })
  stopPositionUpdates()
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

/**
 * Readings do not arrive on the dot: two 15 s fused readings can be 29.8 s
 * apart, and a strict 30 s gap would then wait for the third — 45 s. Measured
 * 2026-09-26 on the owner's phone: 20 s readings gave a point every 42 s.
 */
export const HEARTBEAT_JITTER_MS = 3_000

/** Whether a reading taken at `timestamp` is due to become a point. */
export function isHeartbeatDue(timestamp: number, lastSent: number): boolean {
  return timestamp - lastSent >= SEND_GAP_MS - HEARTBEAT_JITTER_MS
}

type Reading = Parameters<typeof uploadPosition>[0]

/**
 * Hand a point to the upload and return at once.
 *
 * 2026-09-24, the owner's S23: minimised, a point every 93–96 s; the server
 * log showed each POST arriving 2–5 s after its fix. The upload was done — the
 * promise was not: React Native's fetch (whatwg-fetch 3.6) resolves through
 * `setTimeout(0)`, and a backgrounded app's JS timers stand still, so every
 * upload "hung" until HEARTBEAT_STUCK_MS gave up on it. The heartbeat no longer
 * waits for an upload to settle; spacing comes from `lastSentAt`, and the
 * server refuses a repeated `clientLocationId`.
 */
function sendReading(position: Reading) {
  lastSentAt = Number.isFinite(position.timestamp) ? position.timestamp : Date.now()
  void uploadPosition(position).catch((error) => {
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
  // A fused reading is already the OS's best fix; asking for another one
  // would only add a second request per heartbeat.
  if ((reading.coords.accuracy ?? Infinity) <= MAX_ACCURACY && fieldLocationSubscription) {
    sendReading(reading)
    release()
    return
  }
  const fallback = () => {
    const accuracy = reading.coords.accuracy ?? Infinity
    if (accuracy <= MAX_NETWORK_ACCURACY) sendReading(reading)
  }
  // The heartbeat is busy only while a fix is being taken (a native timeout),
  // never while an upload is in flight.
  Geolocation.getCurrentPosition(
    (fix) => {
      const precise = (fix.coords.accuracy ?? Infinity) <= MAX_ACCURACY
      if (precise) sendReading(fix)
      else fallback()
      release()
    },
    () => { fallback(); release() },
    { enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 },
  )
}

/**
 * The owner's drive, 2026-09-22: fifteen minutes and six kilometres between
 * two points. JS asked for a fix on its own clock and a backgrounded app's
 * clock stops, and the community module watches one system provider at a
 * time — indoors the network one, so a car produced rare 100–200 m points.
 * The fused provider (FieldLocationModule) samples in the OS and pushes to
 * JS; this file then only decides what to upload.
 */
type FieldLocationModule = {
  start: () => Promise<boolean>
  stop: () => Promise<boolean>
}

const fieldLocation = (NativeModules as { FieldLocation?: FieldLocationModule }).FieldLocation ?? null
let fieldLocationSubscription: { remove: () => void } | null = null

function startNativeStream(): boolean {
  if (!fieldLocation || fieldLocationSubscription) return Boolean(fieldLocationSubscription)
  const emitter = new NativeEventEmitter(NativeModules.FieldLocation)
  fieldLocationSubscription = emitter.addListener("FieldLocationUpdate", (event: {
    latitude: number
    longitude: number
    accuracy: number | null
    speed: number | null
    heading: number | null
    altitude: number | null
    timestamp: number
  }) => {
    onHeartbeat({
      coords: {
        latitude: event.latitude,
        longitude: event.longitude,
        accuracy: event.accuracy ?? null,
        speed: event.speed ?? null,
        heading: event.heading ?? null,
        altitude: event.altitude ?? null,
      },
      timestamp: event.timestamp,
    })
  })
  fieldLocation.start().then((started) => {
    if (!started) {
      // No permission yet: fall back to the JS watch, which asks for none.
      stopNativeStream()
      startWatching()
    }
  }).catch(() => {
    stopNativeStream()
    startWatching()
  })
  return true
}

function stopNativeStream() {
  fieldLocationSubscription?.remove()
  fieldLocationSubscription = null
  fieldLocation?.stop().catch(() => {})
}

/** The fused stream when the build has it, else the one-provider JS watch. */
function startPositionUpdates() {
  if (startNativeStream()) return
  startWatching()
}

function stopPositionUpdates() {
  stopNativeStream()
  stopWatching()
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
  startPositionUpdates()
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
    stopPositionUpdates()
  })
}
