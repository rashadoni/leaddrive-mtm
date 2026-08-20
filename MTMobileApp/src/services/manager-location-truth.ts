export const MANAGER_PRESENCE_FRESH_MS = 5 * 60 * 1000
// Matches the server's default 10-minute location window. The lean mobile
// endpoint does not yet return tenant-specific thresholds, so we fail toward
// showing an older point as historical rather than pretending it is live.
export const MANAGER_GPS_DELAYED_MS = 10 * 60 * 1000

export type ManagerGpsFreshness = "FRESH" | "DELAYED" | "STALE" | "NO_COORDINATES"

export interface ManagerTeamAgent {
  id: string
  name: string
  role: string
  isOnline: boolean
  lastSeenAt?: string | null
  workday: { status: string } | null
}

export interface ManagerLocationEvidence {
  agentId: string
  latitude: number
  longitude: number
  accuracy: number | null
  battery: number | null
  recordedAt: string | null
  lastSeenAt: string | null
  isOnline: boolean | null
}

export interface ManagerAgentTruth {
  isOnline: boolean
  lastSeenAt: string | null
  location: ManagerLocationEvidence | null
  gpsFreshness: ManagerGpsFreshness
  locationAgeMs: number | null
}

function record(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function validCoordinates(latitude: number | null, longitude: number | null) {
  return latitude != null && longitude != null &&
    latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
}

function timestampMs(value: string | null, nowMs: number): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  // A client clock slightly ahead is harmless. A time well into the future is
  // not reliable evidence of current presence or GPS freshness.
  if (!Number.isFinite(parsed) || parsed > nowMs + 60_000) return null
  return parsed
}

/**
 * Accept both the current nested mobile contract (`id` + `location`) and the
 * older flat contract (`agentId` + coordinates). Identity is mandatory: rows
 * are never matched by array position, name, or another employee's marker.
 */
export function normalizeManagerLocations(value: unknown): ManagerLocationEvidence[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((raw): ManagerLocationEvidence[] => {
    const row = record(raw)
    const agentId = stringOrNull(row.agentId) ?? stringOrNull(row.id)
    if (!agentId) return []

    const nested = record(row.location)
    const source = Object.keys(nested).length > 0 ? nested : row
    const latitude = finiteNumber(source.latitude)
    const longitude = finiteNumber(source.longitude)
    if (!validCoordinates(latitude, longitude)) return []

    return [{
      agentId,
      latitude: latitude!,
      longitude: longitude!,
      accuracy: finiteNumber(source.accuracy),
      battery: finiteNumber(source.battery),
      recordedAt: stringOrNull(source.recordedAt),
      lastSeenAt: stringOrNull(row.lastSeenAt),
      isOnline: typeof row.isOnline === "boolean" ? row.isOnline : null,
    }]
  })
}

function latestTimestamp(left: string | null | undefined, right: string | null | undefined, nowMs: number) {
  const leftMs = timestampMs(left ?? null, nowMs)
  const rightMs = timestampMs(right ?? null, nowMs)
  if (leftMs == null) return rightMs == null ? null : right ?? null
  if (rightMs == null) return left ?? null
  return rightMs > leftMs ? right ?? null : left ?? null
}

/** Build the presentation truth for exactly one employee. */
export function managerAgentTruth(
  agent: ManagerTeamAgent,
  locations: ManagerLocationEvidence[],
  nowMs = Date.now(),
): ManagerAgentTruth {
  const ownLocations = locations
    .filter((location) => location.agentId === agent.id)
    .sort((left, right) => {
      const leftMs = timestampMs(left.recordedAt, nowMs) ?? Number.NEGATIVE_INFINITY
      const rightMs = timestampMs(right.recordedAt, nowMs) ?? Number.NEGATIVE_INFINITY
      return rightMs - leftMs
    })
  const location = ownLocations[0] ?? null
  const lastSeenAt = latestTimestamp(agent.lastSeenAt, location?.lastSeenAt, nowMs)
  const lastSeenMs = timestampMs(lastSeenAt, nowMs)
  const serverOnline = agent.isOnline && location?.isOnline !== false
  const isOnline = serverOnline && lastSeenMs != null && nowMs - lastSeenMs <= MANAGER_PRESENCE_FRESH_MS

  if (!location) {
    return { isOnline, lastSeenAt, location: null, gpsFreshness: "NO_COORDINATES", locationAgeMs: null }
  }

  const recordedAtMs = timestampMs(location.recordedAt, nowMs)
  const locationAgeMs = recordedAtMs == null ? null : Math.max(0, nowMs - recordedAtMs)
  const gpsFreshness: ManagerGpsFreshness = locationAgeMs == null
    ? "STALE"
    : locationAgeMs <= MANAGER_PRESENCE_FRESH_MS
      ? "FRESH"
      : locationAgeMs <= MANAGER_GPS_DELAYED_MS
        ? "DELAYED"
        : "STALE"

  return { isOnline, lastSeenAt, location, gpsFreshness, locationAgeMs }
}

export function formatManagerEvidenceAge(ageMs: number | null): { value: number; unit: "minute" | "hour" | "day" } | null {
  if (ageMs == null || !Number.isFinite(ageMs)) return null
  const minutes = Math.max(0, Math.floor(ageMs / 60_000))
  if (minutes < 60) return { value: minutes, unit: "minute" }
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return { value: hours, unit: "hour" }
  return { value: Math.floor(hours / 24), unit: "day" }
}
