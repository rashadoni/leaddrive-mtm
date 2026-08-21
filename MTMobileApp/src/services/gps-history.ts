/**
 * Pure mapper for the agent GPS history (GET /mobile/location?date=YYYY-MM-DD).
 * The screen derives its route view and playback model from these factual
 * server records; this mapper deliberately does not infer visits or stops.
 *
 * SWM-10/SWM-11 remain Partial until the server supplies authoritative stops,
 * visit correlation, anomaly classification and planned-vs-actual data. The
 * mobile client must not manufacture those facts from raw points.
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
  timezone?: string
  distanceMeters: number
  distanceKm: number
  gpsIntervalSeconds?: number
  pointCount: number
  points: GpsPoint[]
}

function num(value: unknown): number | undefined {
  if (value === null || value === undefined || typeof value === "boolean") return undefined
  if (typeof value !== "number" && typeof value !== "string") return undefined
  if (typeof value === "string" && value.trim().length === 0) return undefined
  const n = typeof value === "number" ? value : Number(value.trim())
  return Number.isFinite(n) ? n : undefined
}

export function normalizeGpsTimeZone(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) return undefined
  const timezone = value.trim()
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(new Date(0))
    return timezone
  } catch {
    return undefined
  }
}

/** Return a YYYY-MM-DD key in the tenant/server timezone when one is known. */
export function gpsDateKey(date: Date, timezone?: string | null): string {
  const safeTimezone = normalizeGpsTimeZone(timezone)
  if (!safeTimezone) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
  }

  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: safeTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date)
    const year = parts.find((part) => part.type === "year")?.value
    const month = parts.find((part) => part.type === "month")?.value
    const day = parts.find((part) => part.type === "day")?.value
    if (year && month && day) return `${year}-${month}-${day}`
  } catch {
    // Fall through to the device calendar only when Intl rejects the timezone.
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

export function formatGpsPointTime(
  value: string,
  language: string,
  timezone?: string | null,
): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  const safeTimezone = normalizeGpsTimeZone(timezone)
  return date.toLocaleTimeString(language, {
    hour: "2-digit",
    minute: "2-digit",
    ...(safeTimezone ? { timeZone: safeTimezone } : {}),
  })
}

export function toGpsHistory(raw: any): GpsHistory {
  const locations = Array.isArray(raw?.locations) ? (raw.locations as any[]) : []
  const distanceMeters = num(raw?.distanceMeters) ?? 0
  return {
    date: String(raw?.date ?? ""),
    timezone: normalizeGpsTimeZone(raw?.timezone),
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
