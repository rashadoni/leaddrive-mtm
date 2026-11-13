import { useEffect } from "react"
import { AppState } from "react-native"
import Geolocation from "@react-native-community/geolocation"
import { lastKnownPosition } from "./location"

/**
 * Where the agent stands when he starts or ends a visit or takes its photo.
 *
 * Owner, 2026-11-13: «нажимаешь начать визит и закончить — очень долго
 * загрузка, секунд 6». Every press asked the phone for a NEW satellite fix
 * (high accuracy, cache ≤ 5 s, waiting up to 15 s), and the Android
 * LocationManager indoors — a clinic — takes seconds to answer one. The
 * tracking service already reads the position every 30 s, and while a visit
 * button is on screen short readings keep one warm: a fix this young is taken at
 * once, and only without one does the press wait for the satellites as
 * before.
 */
export const VISIT_FIX_MAX_AGE_MS = 15_000
/** Worse than this is not where he stands; ask the phone again. */
export const VISIT_FIX_MAX_ACCURACY_M = 100

export type VisitFix = { latitude: number; longitude: number; accuracy?: number; timestamp: number }
export type VisitCoords = { latitude: number; longitude: number }

let warmFix: VisitFix | null = null

function usable(fix: VisitFix | null | undefined, now: number): fix is VisitFix {
  if (!fix) return false
  if (!Number.isFinite(fix.latitude) || !Number.isFinite(fix.longitude)) return false
  if (fix.latitude === 0 && fix.longitude === 0) return false
  const age = now - fix.timestamp
  if (!(age >= 0 && age <= VISIT_FIX_MAX_AGE_MS)) return false
  return fix.accuracy == null || !(fix.accuracy > VISIT_FIX_MAX_ACCURACY_M)
}

/** The youngest fix the phone already has that is fit for a visit, or null. */
export function recentVisitFix(now = Date.now()): VisitFix | null {
  const candidates = [warmFix, lastKnownPosition].filter((fix): fix is VisitFix => usable(fix, now))
  candidates.sort((a, b) => b.timestamp - a.timestamp)
  return candidates[0] ?? null
}

export function rememberVisitFix(position: { coords: { latitude: number; longitude: number; accuracy?: number | null } }, now = Date.now()): void {
  const { latitude, longitude, accuracy } = position.coords
  warmFix = { latitude, longitude, accuracy: typeof accuracy === "number" ? accuracy : undefined, timestamp: now }
}

/** For tests. */
export function forgetVisitFix(): void {
  warmFix = null
}

/**
 * The position for a visit action: a fix the phone already has when it is
 * young enough, otherwise a new reading as before (rejects as before).
 */
export function readVisitPosition(timeout: number): Promise<VisitCoords> {
  const recent = recentVisitFix()
  if (recent) return Promise.resolve({ latitude: recent.latitude, longitude: recent.longitude })
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (position) => {
        rememberVisitFix(position)
        resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude })
      },
      reject,
      { enableHighAccuracy: true, timeout, maximumAge: 5000 },
    )
  })
}

/** Pause between warm readings, after the previous one has answered. */
export const VISIT_FIX_WARM_PAUSE_MS = 8_000

/**
 * Starts keeping a fix warm; returns the stop. Never throws.
 *
 * One-shot readings in a loop, not `watchPosition`: the community module has
 * ONE native watch, and the tracking fallback (location.android.ts) owns it —
 * a second watch would swap its provider and interval and, cleared, leave
 * them swapped.
 */
export function warmVisitPosition(pauseMs = VISIT_FIX_WARM_PAUSE_MS): () => void {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const next = () => {
    if (stopped) return
    timer = setTimeout(read, pauseMs)
  }
  function read() {
    timer = null
    if (stopped) return
    try {
      Geolocation.getCurrentPosition(
        (position) => {
          if (!stopped) rememberVisitFix(position)
          next()
        },
        () => next(),
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 5000 },
      )
    } catch {
      // No location module (tests, a broken build): nothing to keep warm.
    }
  }
  read()
  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
    timer = null
  }
}

/**
 * Keeps a fix warm while `wanted` — a visit button is on screen — and the app
 * is in front. Nothing runs while it is in the background.
 */
export function useWarmVisitPosition(wanted: boolean): void {
  useEffect(() => {
    if (!wanted) return
    let stop: (() => void) | null = AppState.currentState === "active" ? warmVisitPosition() : null
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        if (!stop) stop = warmVisitPosition()
      } else if (stop) {
        stop()
        stop = null
      }
    })
    return () => {
      subscription.remove()
      if (stop) stop()
    }
  }, [wanted])
}
