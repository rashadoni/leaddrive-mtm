export type AppRole = "AGENT" | "SUPERVISOR" | "MANAGER" | "ADMIN" | "UNKNOWN"

const KNOWN_ROLES = new Set<AppRole>(["AGENT", "SUPERVISOR", "MANAGER", "ADMIN"])

export function normalizeRole(role?: string | null): AppRole {
  const normalized = role?.trim().toUpperCase() as AppRole | undefined
  return normalized && KNOWN_ROLES.has(normalized) ? normalized : "UNKNOWN"
}

export function isManagerRole(role?: string | null) {
  const normalized = normalizeRole(role)
  return normalized === "SUPERVISOR" || normalized === "MANAGER" || normalized === "ADMIN"
}

export function canTrackFieldLocation(role?: string | null) {
  return normalizeRole(role) === "AGENT"
}

/**
 * Offline field data belongs to the agent workspace. Team roles use the
 * dedicated manager endpoints and must not call FIELD_EXECUTE-only sync
 * routes, otherwise a healthy manager session is incorrectly marked as a
 * failed/offline sync after the server returns 403.
 */
export function canExecuteFieldWork(role?: string | null) {
  return normalizeRole(role) === "AGENT"
}
