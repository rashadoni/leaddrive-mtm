/**
 * Alert text, assembled here rather than on the server.
 *
 * Field UX audit 2026-09-05, task A4. The server used to store a finished
 * English sentence — "Agent is 800m away from planned route (max 500m)" — and
 * an Azerbaijani rep read exactly that. It now also stores what happened and
 * with which numbers, in `metadata.messageKey` and `metadata.messageParams`,
 * so the phone can say it in the rep's own language.
 *
 * Two rules this file exists to keep:
 *
 * 1. An alert is never blank. A row written before the server change, a key
 *    this build does not know, or params that lost a number — all fall back to
 *    the stored sentence. Old English is worse than a translation and far
 *    better than an empty card in front of someone standing in a pharmacy.
 * 2. The key list mirrors the server's `src/lib/mtm/alert-messages.ts`. When
 *    one side gains a key, the other renders it as legacy until it catches up,
 *    which is exactly the safe direction.
 */

export const ALERT_MESSAGE_KEYS = [
  "visitStillOpen",
  "outOfZoneCheckIn",
  "outOfZoneCheckInForced",
  "geofenceViolation",
  "routeDeviation",
  "agentRouteDeviation",
  "agentOutOfZoneCheckIn",
] as const

export type AlertMessageKey = (typeof ALERT_MESSAGE_KEYS)[number]

/** Params each sentence needs; a key missing one of them is not renderable. */
export const ALERT_MESSAGE_PARAMS: Record<AlertMessageKey, readonly string[]> = {
  visitStillOpen: ["customerName", "minutes", "thresholdMinutes"],
  outOfZoneCheckIn: ["distanceMeters", "geofenceRadius"],
  outOfZoneCheckInForced: ["distanceMeters", "geofenceRadius"],
  geofenceViolation: ["customerName", "distanceMeters", "geofenceRadius"],
  routeDeviation: ["deviationMeters", "thresholdMeters"],
  agentRouteDeviation: ["deviationMeters"],
  agentOutOfZoneCheckIn: ["customerName", "distanceMeters", "geofenceRadius"],
}

export type AlertMessageParams = Record<string, string | number>

export type AlertMessage =
  | { kind: "localized"; key: AlertMessageKey; params: AlertMessageParams }
  | { kind: "legacy" }

export function readAlertMessage(metadata: unknown): AlertMessage {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return { kind: "legacy" }
  const { messageKey, messageParams } = metadata as Record<string, unknown>
  if (typeof messageKey !== "string") return { kind: "legacy" }
  if (!(ALERT_MESSAGE_KEYS as readonly string[]).includes(messageKey)) return { kind: "legacy" }
  const key = messageKey as AlertMessageKey
  const params: AlertMessageParams = {}
  if (messageParams && typeof messageParams === "object" && !Array.isArray(messageParams)) {
    for (const [name, value] of Object.entries(messageParams as Record<string, unknown>)) {
      if (typeof value === "string" || typeof value === "number") params[name] = value
    }
  }
  for (const name of ALERT_MESSAGE_PARAMS[key]) {
    if (!(name in params)) return { kind: "legacy" }
  }
  return { kind: "localized", key, params }
}

/**
 * How long an unresolved alert stays in "Active".
 *
 * The audit found June alerts still listed as active in September. Nobody acts
 * on those; they only push today's warning off the visible part of the card.
 * Anything older is still on the server and still unresolved — it just stops
 * claiming the rep's attention.
 */
export const ACTIVE_ALERT_WINDOW_DAYS = 14

export function isActiveAlert(
  alert: { isResolved?: boolean; createdAt?: string | null },
  now: Date,
  windowDays: number = ACTIVE_ALERT_WINDOW_DAYS,
): boolean {
  if (alert.isResolved) return false
  if (!alert.createdAt) return false
  const created = new Date(alert.createdAt).getTime()
  // An unparseable date is not evidence of freshness; keeping it would put the
  // exact rows this window exists to hide back at the top of the list.
  if (!Number.isFinite(created)) return false
  const ageMs = now.getTime() - created
  if (ageMs < 0) return true
  return ageMs <= windowDays * 24 * 60 * 60 * 1000
}
