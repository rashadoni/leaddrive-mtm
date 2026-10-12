/**
 * «Клиент здесь»: the agent, standing at a customer whose pin is in the wrong
 * place, asks for the pin to be moved to where the customer really is.
 *
 * The owner, 12 October 2026: «агент приходит на тот адрес, но видит, что не
 * те координаты. У него должна быть возможность отправить запрос на
 * корректировку, отправляя с места, где клиент, координаты. И чтоб было
 * максимально интуитивно и интерактивно».
 *
 * The agent never changes a customer himself: this is a question a manager
 * answers. The numbers below are the server's own
 * (leaddrive-v2 `src/lib/mtm/customer-location-request.ts`); the app repeats
 * them so that it says «подойдите ближе» before the agent presses the button,
 * not after. The server refuses by itself whatever the app lets through.
 *
 * Free of React Native imports: the rules are tested on their own.
 */

/** How unsure of itself the phone may be and still be believed. */
export const LOCATION_FIX_MAX_ACCURACY_METERS = 100
/** How far from where he stands the agent may put the pin. */
export const LOCATION_FIX_MAX_PIN_FROM_AGENT_METERS = 150
/** A pin already this close to the proposed place is where it should be. */
export const LOCATION_FIX_MIN_MOVE_METERS = 20
/** How old the phone's fix may be when the request is sent. */
export const LOCATION_FIX_MAX_FIX_AGE_SECONDS = 120
/**
 * The card offers «Клиент здесь» by itself only between these two distances
 * from the pin: nearer, the agent is simply at the customer; much further, he
 * is somewhere else altogether and the offer would be noise. The button
 * «Адрес неверный?» is on the card at any distance.
 */
export const LOCATION_FIX_OFFER_FROM_METERS = 300
export const LOCATION_FIX_OFFER_TO_METERS = 3_000

export interface LocationFixPoint {
  latitude: number
  longitude: number
}

export interface LocationFixReading extends LocationFixPoint {
  /** Metres; undefined when the phone did not say. */
  accuracy?: number
  /** The phone's own clock at the moment of the fix, ms. */
  timestamp: number
  /** Android says so itself when a mock provider answered. */
  mocked?: boolean
}

/** A coordinate pair a map can show: both numbers, in range, and not 0,0. */
export function usablePoint(value: { latitude?: unknown; longitude?: unknown } | null | undefined): LocationFixPoint | null {
  const latitude = value?.latitude
  const longitude = value?.longitude
  if (typeof latitude !== "number" || typeof longitude !== "number") return null
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null
  if (latitude === 0 && longitude === 0) return null
  return { latitude, longitude }
}

/** Great-circle distance in metres. */
export function locationFixDistanceMeters(from: LocationFixPoint, to: LocationFixPoint): number {
  const radius = 6_371_000
  const rad = (degrees: number) => (degrees * Math.PI) / 180
  const dLat = rad(to.latitude - from.latitude)
  const dLng = rad(to.longitude - from.longitude)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(from.latitude)) * Math.cos(rad(to.latitude)) * Math.sin(dLng / 2) ** 2
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** What the customer's card offers before the agent asks for anything. */
export type LocationFixOffer =
  /** The customer has no pin at all: it cannot be visited until it gets one. */
  | { kind: "no-pin" }
  /** The agent is near, and not at, the pin: it may be the pin that is wrong. */
  | { kind: "pin-far"; distanceMeters: number }
  | { kind: "none" }

export function locationFixOffer(pin: LocationFixPoint | null, position: LocationFixPoint | null): LocationFixOffer {
  if (!pin) return { kind: "no-pin" }
  if (!position) return { kind: "none" }
  const distance = locationFixDistanceMeters(position, pin)
  if (distance < LOCATION_FIX_OFFER_FROM_METERS || distance > LOCATION_FIX_OFFER_TO_METERS) return { kind: "none" }
  return { kind: "pin-far", distanceMeters: Math.round(distance) }
}

/** Why the request cannot be sent as it stands — said on the screen, under the map. */
export type LocationFixProblem = "noFix" | "mock" | "accuracy" | "stale" | "pinTooFar" | "unchanged"

/**
 * The app's own reading of the server's rules, for the moment before sending:
 * `pin` is where the agent has put the new pin, `fix` where the phone is,
 * `current` where the customer's pin stands now (null: it has none).
 */
export function locationFixProblem(
  pin: LocationFixPoint | null,
  fix: LocationFixReading | null,
  current: LocationFixPoint | null,
  nowMs: number,
): LocationFixProblem | null {
  if (!pin || !fix) return "noFix"
  if (fix.mocked === true) return "mock"
  if (typeof fix.accuracy === "number" && fix.accuracy > LOCATION_FIX_MAX_ACCURACY_METERS) return "accuracy"
  if (locationFixAgeSeconds(fix, nowMs) > LOCATION_FIX_MAX_FIX_AGE_SECONDS) return "stale"
  if (locationFixDistanceMeters(fix, pin) > LOCATION_FIX_MAX_PIN_FROM_AGENT_METERS) return "pinTooFar"
  if (current && locationFixDistanceMeters(current, pin) < LOCATION_FIX_MIN_MOVE_METERS) return "unchanged"
  return null
}

/** How old the fix is, by the phone's own clock on both sides. Never negative. */
export function locationFixAgeSeconds(fix: { timestamp: number }, nowMs: number): number {
  return Math.max(0, Math.round((nowMs - fix.timestamp) / 1000))
}

/** What the phone sends: the pin the agent chose and what the phone knew of itself. */
export function locationFixPayload(
  idempotencyKey: string,
  pin: LocationFixPoint,
  fix: LocationFixReading,
  comment: string,
  nowMs: number,
) {
  const said = comment.trim()
  return {
    idempotencyKey,
    proposed: { latitude: pin.latitude, longitude: pin.longitude },
    agent: {
      latitude: fix.latitude,
      longitude: fix.longitude,
      // A phone that did not say how sure it is has not said «exactly here».
      accuracyMeters: typeof fix.accuracy === "number" && fix.accuracy >= 0 ? fix.accuracy : LOCATION_FIX_MAX_ACCURACY_METERS,
      fixAgeSeconds: locationFixAgeSeconds(fix, nowMs),
      ...(typeof fix.mocked === "boolean" ? { isMock: fix.mocked } : {}),
    },
    ...(said ? { comment: said.slice(0, 300) } : {}),
  }
}

/** What went wrong with a sending, as the screen names it. */
export type LocationFixFailure =
  | LocationFixProblem
  | "pending"
  | "switchedOff"
  | "notFound"
  | "tooMany"
  | "offline"
  | "failed"

const SERVER_CODES: Record<string, LocationFixFailure> = {
  MTM_LOCATION_REQUEST_MOCK_LOCATION: "mock",
  MTM_LOCATION_REQUEST_ACCURACY_TOO_LOW: "accuracy",
  MTM_LOCATION_REQUEST_FIX_TOO_OLD: "stale",
  MTM_LOCATION_REQUEST_PIN_TOO_FAR: "pinTooFar",
  MTM_LOCATION_REQUEST_UNCHANGED: "unchanged",
  MTM_LOCATION_REQUEST_PENDING: "pending",
  MTM_LOCATION_REQUEST_RATE_LIMITED: "tooMany",
  MTM_AGENT_PERMISSION_DISABLED: "switchedOff",
  MTM_ROUTE_FIELD_ORGANIZATION_NOT_FOUND: "notFound",
}

export function locationFixFailure(error: unknown): LocationFixFailure {
  const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined
  if (typeof code === "string" && SERVER_CODES[code]) return SERVER_CODES[code]
  const message = error instanceof Error ? error.message : ""
  if (message === "REQUEST_TIMEOUT" || message === "Network request failed" || message === "ABORTED") return "offline"
  return "failed"
}

/** The state of a request as the customer's card was told it. */
export interface LocationFixRequest {
  id: string
  status: "SUBMITTED" | "APPROVED" | "REJECTED"
  /** Sent by this agent, not by a colleague. */
  mine: boolean
  proposed: LocationFixPoint | null
  decisionComment?: string
}

export function toLocationFixRequest(raw: unknown): LocationFixRequest | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as Record<string, unknown>
  const id = typeof row.id === "string" ? row.id : ""
  const status = row.status
  if (!id || (status !== "SUBMITTED" && status !== "APPROVED" && status !== "REJECTED")) return null
  const comment = typeof row.decisionComment === "string" ? row.decisionComment.trim() : ""
  return {
    id,
    status,
    mine: row.mine === true,
    proposed: usablePoint({ latitude: row.proposedLatitude, longitude: row.proposedLongitude }),
    ...(comment ? { decisionComment: comment } : {}),
  }
}

/** «350 м», «1,2 км» — as a person says a distance. */
export function formatLocationFixDistance(meters: number, locale: string, units: { m: string; km: string }): string {
  if (meters < 1000) return `${Math.round(meters)} ${units.m}`
  const km = Math.round(meters / 100) / 10
  return `${km.toLocaleString(locale, { maximumFractionDigits: 1 })} ${units.km}`
}

/**
 * «Клиент здесь», while the request waits. The server lets the agent who sent
 * a request start his visit from the place the request names (leaddrive-v2
 * `waitingLocationRequestCovers`); a manager sees such a visit marked «адрес на
 * проверке». The app must not stop him first: its own «слишком далеко» and
 * «нет координат» are measured against the pin he has just reported as wrong.
 *
 * So the app remembers the place of each request it knows to be waiting — one
 * per customer, for the agent who sent it — and measures a check-in against
 * that place when the agent stands there. It is a memory, not a permission:
 * the server decides, and a check-in it refuses takes the memory away.
 */
export interface WaitingLocationFix extends LocationFixPoint {
  agentId: string
  /** The phone's clock when the place was remembered, ms. */
  savedAt: number
}

/** A request left unanswered for this long is no longer assumed to be waiting. */
export const WAITING_LOCATION_FIX_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/** What survives a reading of the stored map: well-formed, not too old. */
export function readWaitingLocationFixes(raw: unknown, nowMs: number): Record<string, WaitingLocationFix> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const kept: Record<string, WaitingLocationFix> = {}
  for (const [customerId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!customerId || !value || typeof value !== "object") continue
    const row = value as Record<string, unknown>
    const point = usablePoint(row)
    const agentId = typeof row.agentId === "string" ? row.agentId : ""
    const savedAt = typeof row.savedAt === "number" && Number.isFinite(row.savedAt) ? row.savedAt : NaN
    if (!point || !agentId || Number.isNaN(savedAt)) continue
    if (nowMs - savedAt > WAITING_LOCATION_FIX_MAX_AGE_MS || savedAt - nowMs > 60_000) continue
    kept[customerId] = { ...point, agentId, savedAt }
  }
  return kept
}

/** The place this agent reported for this customer, if his request is still thought to be waiting. */
export function waitingLocationFixOf(
  fixes: Record<string, WaitingLocationFix>,
  agentId: string | null | undefined,
  customerId: string,
  nowMs: number,
): LocationFixPoint | null {
  const fix = fixes[customerId]
  if (!fix || !agentId || fix.agentId !== agentId) return null
  if (nowMs - fix.savedAt > WAITING_LOCATION_FIX_MAX_AGE_MS) return null
  return { latitude: fix.latitude, longitude: fix.longitude }
}

/**
 * Is this check-in made from the place the agent reported? Within the
 * customer's own zone around it — a door, not a district — as the server
 * measures it.
 */
export function locationFixCoversCheckIn(
  waiting: LocationFixPoint | null,
  position: LocationFixPoint | null,
  radiusMeters: number,
): boolean {
  if (!waiting || !position) return false
  return locationFixDistanceMeters(position, waiting) <= radiusMeters
}

