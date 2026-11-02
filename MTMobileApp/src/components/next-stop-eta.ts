import {
  distanceBetweenMeters,
  hasUsableCoordinates,
  type CoordinatePair,
  type UsableCoordinates,
} from "../screens/visit/visit-checkin-model"

/**
 * «6 dəq qaldı» over the agent's marker on the line of the day (owner,
 * 2026-11-02, variant «B. На линии дня», like «4h Away» in the delivery
 * reel): roughly how long to the next client from where the phone is now.
 *
 * No map provider is approved (`route-travel.ts` on the server), so it is an
 * estimate: the straight line stretched to the roads a city has, at a city's
 * pace, without traffic. Nothing is said when it could only be a wrong guess —
 * no fresh fix, no coordinates at the client, the agent already there, or a
 * trip too long to be the next stop of a working day.
 */
export const ETA_ROAD_FACTOR = 1.35
export const ETA_CITY_KMH = 25
/** A fix older than this says where the agent was, not where he is. */
export const ETA_FIX_MAX_AGE_MS = 2 * 60_000
/** A fix this vague cannot tell 3 minutes from 10. */
export const ETA_FIX_MAX_ACCURACY_M = 300
/** Farther than this the next stop is not a drive across town: say nothing. */
export const ETA_MAX_MINUTES = 180

export interface PhoneFix {
  latitude: number
  longitude: number
  accuracy?: number | null
  /** Epoch ms the phone took the fix at. */
  timestamp: number
}

/** The fix as a place, if it is recent and sharp enough to plan by. */
export function freshFix(fix: PhoneFix | null, now: number = Date.now()): UsableCoordinates | null {
  if (!fix || !hasUsableCoordinates(fix)) return null
  if (!Number.isFinite(fix.timestamp) || now - fix.timestamp > ETA_FIX_MAX_AGE_MS) return null
  if (typeof fix.accuracy === "number" && fix.accuracy > ETA_FIX_MAX_ACCURACY_M) return null
  return { latitude: fix.latitude, longitude: fix.longitude }
}

/** Whole minutes to the client, or null when nothing honest can be said. */
export function nextStopMinutes(
  from: UsableCoordinates | null,
  to: CoordinatePair | null | undefined,
  arrivedWithinMeters: number,
): number | null {
  if (!from || !hasUsableCoordinates(to)) return null
  const meters = distanceBetweenMeters(from, to)
  if (meters <= arrivedWithinMeters) return null
  const minutes = Math.max(1, Math.ceil((meters * ETA_ROAD_FACTOR) / ((ETA_CITY_KMH * 1000) / 60)))
  return minutes > ETA_MAX_MINUTES ? null : minutes
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NextStopT = (key: string, values?: any) => any

/** «6 dəq qaldı» / «1 saat 20 dəq qaldı» through the caller's translations. */
export function nextStopMinutesLabel(minutes: number, t: NextStopT): string {
  return minutes < 60
    ? String(t("dayTrack.minutesLeft", { minutes }))
    : String(t("dayTrack.hoursMinutesLeft", { hours: Math.floor(minutes / 60), minutes: minutes % 60 }))
}
