import type { OutboxOperation } from "../../services/outbox"

/**
 * Every way a check-in can end, as the agent must see it (field UX audit
 * M-01, task B1). The server contract is one vocabulary for the interactive
 * and the offline route (leaddrive-v2 `src/lib/mtm/check-in-errors.ts`, spec
 * §2.4); the app branches on `serverData.code` only and never on the text.
 */
export type CheckInOutcome =
  | { kind: "accepted" }
  | { kind: "queued" }
  | { kind: "too_far"; distanceMeters: number | null; maxMeters: number | null }
  | { kind: "no_coordinates" }
  | { kind: "active_visit" }
  | { kind: "route_mismatch" }
  | { kind: "customer_missing" }
  | { kind: "offline" }
  | { kind: "server_error"; message: string | null }

const ROUTE_MISMATCH_CODES = new Set([
  "MTM_ROUTE_POINT_NOT_AVAILABLE",
  "MTM_ROUTE_POINT_ALREADY_ACTIVE",
  "MTM_ROUTE_TARGET_MISMATCH",
  "MTM_ROUTE_TARGET_INVALID",
])

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

/**
 * @param operation the outbox row of this check-in after a sync attempt, or
 *   undefined when the outbox no longer holds it (the server accepted it).
 * @param syncSucceeded whether the sync run reached the server at all.
 */
export function checkInOutcomeFromOperation(
  operation: OutboxOperation | undefined,
  syncSucceeded: boolean,
): CheckInOutcome {
  if (!operation) return { kind: "accepted" }
  if (operation.status === "conflict") {
    const serverData = operation.conflict?.serverData ?? {}
    const code = typeof serverData.code === "string" ? serverData.code : null
    if (code === "MTM_VISIT_OUT_OF_ZONE") {
      return {
        kind: "too_far",
        distanceMeters: numberOrNull(serverData.distanceMeters),
        maxMeters: numberOrNull(serverData.geofenceRadius),
      }
    }
    if (code === "MTM_VISIT_CUSTOMER_NO_COORDINATES") return { kind: "no_coordinates" }
    if (code === "MTM_VISIT_ALREADY_ACTIVE") return { kind: "active_visit" }
    if (code && ROUTE_MISMATCH_CODES.has(code)) return { kind: "route_mismatch" }
    if (code === "MTM_VISIT_CUSTOMER_NOT_FOUND" || code === "MTM_VISIT_CONTACT_NOT_FOUND") {
      return { kind: "customer_missing" }
    }
    return { kind: "server_error", message: operation.conflict?.error ?? code }
  }
  // Still pending: the sync either never reached the server (offline) or the
  // server deferred it; both mean "saved on the device, will retry".
  return syncSucceeded ? { kind: "queued" } : { kind: "offline" }
}

export function formatCheckInDistance(meters: number | null): string {
  if (meters == null) return "?"
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}
