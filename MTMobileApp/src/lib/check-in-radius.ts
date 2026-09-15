/**
 * The check-in zone the server will enforce, in meters. Kept free of React
 * Native imports so the rule is tested on its own.
 *
 * Redmi Pad SE, 2026-09-15: the app refused «ən çox 100 m» while the
 * organization's zone was 250 m, turning agents back from check-ins the
 * server would have taken. The route point's radius (the customer's own, else
 * the organization's) wins; then the organization's from bootstrap; 100 m only
 * for a server that sends neither.
 */
export const FALLBACK_CHECK_IN_RADIUS_METERS = 100

function positiveMeters(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null
}

export function checkInRadiusMeters(
  pointRadius: number | null | undefined,
  policies: { checkInGeofenceRadiusMeters?: number | null } | null | undefined,
): number {
  return positiveMeters(pointRadius) ?? positiveMeters(policies?.checkInGeofenceRadiusMeters) ?? FALLBACK_CHECK_IN_RADIUS_METERS
}
