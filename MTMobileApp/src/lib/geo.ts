/**
 * Customer coordinates: "no data" is null on both axes, never 0.
 *
 * (0, 0) is Null Island in the Gulf of Guinea. Until 2026-09 the server stored
 * unknown coordinates as 0 and this app happily measured "6745.7 km" from
 * Baku (field UX audit M-02). The server now sends null/null
 * (leaddrive-v2 task A1); this guard is the client-side twin so a stale cache
 * or an older server can never turn "unknown" into a distance.
 */
export type CoordinateInput = { latitude?: number | null; longitude?: number | null }

export function hasCoordinates(
  value: CoordinateInput | null | undefined,
): value is CoordinateInput & { latitude: number; longitude: number } {
  if (!value) return false
  const { latitude, longitude } = value
  if (typeof latitude !== "number" || typeof longitude !== "number") return false
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return false
  return !(latitude === 0 && longitude === 0)
}

/** Great-circle distance in meters; callers must check `hasCoordinates` first. */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radius = 6_371_000
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const deltaLat = toRadians(lat2 - lat1)
  const deltaLon = toRadians(lon2 - lon1)
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLon / 2) ** 2
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
