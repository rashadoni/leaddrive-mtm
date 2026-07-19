/**
 * Pure mapper for the agent GPS history (GET /mobile/location?date=YYYY-MM-DD).
 * A list view of the day's recorded points + a distance summary — the in-app
 * map/replay (SWM-11) is a separate native-dependency track.
 */

export interface GpsPoint {
  id: string
  recordedAt: string
  latitude?: number
  longitude?: number
  accuracy?: number
  speed?: number
  battery?: number
}

export interface GpsHistory {
  date: string
  distanceMeters: number
  distanceKm: number
  gpsIntervalSeconds?: number
  pointCount: number
  points: GpsPoint[]
}

function num(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : undefined
}

export function toGpsHistory(raw: any): GpsHistory {
  const locations = Array.isArray(raw?.locations) ? (raw.locations as any[]) : []
  const distanceMeters = num(raw?.distanceMeters) ?? 0
  return {
    date: String(raw?.date ?? ""),
    distanceMeters,
    distanceKm: Math.round((distanceMeters / 1000) * 10) / 10,
    gpsIntervalSeconds: num(raw?.gpsIntervalSeconds),
    pointCount: locations.length,
    points: locations.map((l) => ({
      id: String(l?.id ?? ""),
      recordedAt: String(l?.recordedAt ?? ""),
      latitude: num(l?.latitude),
      longitude: num(l?.longitude),
      accuracy: num(l?.accuracy),
      speed: num(l?.speed),
      battery: num(l?.battery),
    })),
  }
}
