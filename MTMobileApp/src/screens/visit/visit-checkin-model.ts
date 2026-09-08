/**
 * Pure rules for the unplanned check-in flow.
 *
 * Field audit 2026-09-05: a customer without stored coordinates was shown
 * 6745 km away (the distance from Baku to 0°,0°) and "Start unplanned visit"
 * ended without any visible result. These helpers make the preconditions
 * explicit so the screen can always tell the agent what happened.
 *
 * Owner decision (plan §6.2): a check-in at a customer without coordinates is
 * always refused; the agent is told to ask the manager to add them.
 */

export type CoordinatePair = {
  latitude?: number | null
  longitude?: number | null
}

export type UsableCoordinates = { latitude: number; longitude: number }

export type PositionFailure = "permission" | "gps"

/** Stored coordinates farther than this from the agent are treated as wrong data, not as a long trip. */
export const IMPLAUSIBLE_DISTANCE_METERS = 200_000

export type CustomerCoordinateState = "known" | "missing" | "suspicious"

export type CheckInPrecondition =
  | { kind: "ready"; distanceMeters: number }
  /**
   * The shift is on a break. The server refuses GPS recorded inside a pause
   * and would refuse this visit's coordinates too, so the app stops here and
   * offers to come back from the break instead (audit A7/B3, task T4).
   */
  | { kind: "workday-paused" }
  | { kind: "no-coordinates" }
  | { kind: "no-position"; reason: PositionFailure }
  | { kind: "implausible-distance"; distanceMeters: number }

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

/**
 * Coordinates are usable only when both values are finite, inside the valid
 * ranges and not the 0°,0° placeholder that empty imports produce.
 */
export function hasUsableCoordinates(pair: CoordinatePair | null | undefined): pair is UsableCoordinates {
  if (!pair) return false
  const { latitude, longitude } = pair
  if (!finite(latitude) || !finite(longitude)) return false
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return false
  if (latitude === 0 && longitude === 0) return false
  return true
}

export function distanceBetweenMeters(from: UsableCoordinates, to: UsableCoordinates): number {
  const R = 6371000
  const toRad = (degrees: number) => (degrees * Math.PI) / 180
  const p1 = toRad(from.latitude)
  const p2 = toRad(to.latitude)
  const dp = toRad(to.latitude - from.latitude)
  const dl = toRad(to.longitude - from.longitude)
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

/**
 * Distance shown in the customer list. `null` means "do not show a distance":
 * either the customer has no usable coordinates or the stored ones are so far
 * away that they cannot be right.
 */
export function describeCustomerDistance(
  customer: CoordinatePair,
  position: UsableCoordinates | null,
): { state: CustomerCoordinateState; distanceMeters: number | null } {
  if (!hasUsableCoordinates(customer)) return { state: "missing", distanceMeters: null }
  if (!position) return { state: "known", distanceMeters: null }
  const distance = distanceBetweenMeters(position, customer)
  if (distance > IMPLAUSIBLE_DISTANCE_METERS) return { state: "suspicious", distanceMeters: null }
  return { state: "known", distanceMeters: distance }
}

export function resolveCheckInPrecondition(input: {
  customer: CoordinatePair
  position: UsableCoordinates | null
  positionFailure?: PositionFailure | null
  /** True while the agent's own shift is paused. */
  workdayPaused?: boolean
}): CheckInPrecondition {
  // First, and before anything about coordinates: on a break nothing else
  // matters. Telling the agent "no GPS" or "too far" while the real answer is
  // "you are on a break" sends them looking for the wrong problem.
  if (input.workdayPaused) return { kind: "workday-paused" }
  if (!hasUsableCoordinates(input.customer)) return { kind: "no-coordinates" }
  if (!input.position) return { kind: "no-position", reason: input.positionFailure ?? "gps" }
  const distanceMeters = distanceBetweenMeters(input.position, input.customer)
  if (distanceMeters > IMPLAUSIBLE_DISTANCE_METERS) return { kind: "implausible-distance", distanceMeters }
  return { kind: "ready", distanceMeters }
}

export function formatDistanceMeters(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}
