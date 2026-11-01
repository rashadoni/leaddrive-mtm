/**
 * Car, on foot, standing — the pictures and colours the manager's maps draw
 * them with (owner, 2026-11-01, of the mockup «MTM: движение на карте»: the
 * same icons and arrows as the web). The server decides which one applies
 * (leaddrive-v2 `src/lib/mtm/movement-mode.ts`); the app only draws it.
 *
 * Fixed strings: nothing from the server is drawn with them.
 */
export type MovementMode = "DRIVE" | "WALK" | "STAY"

export const MOVEMENT_ICON_SVG: Record<MovementMode | "BREAK" | "GAP", string> = {
  DRIVE: '<path fill="currentColor" d="M3.5 16.2v-4.4l2-5A2.2 2.2 0 0 1 7.5 5.4h9a2.2 2.2 0 0 1 2 1.4l2 5v4.4a1 1 0 0 1-1 1h-.9a2.3 2.3 0 0 1-4.5 0H9.9a2.3 2.3 0 0 1-4.5 0h-.9a1 1 0 0 1-1-1zM6.3 11h11.4l-1.3-3.4H7.6z"/>',
  WALK: '<circle cx="13.5" cy="3.8" r="2.1" fill="currentColor"/><path d="M9.5 21.5l2.3-6.2 2.7 2.6v3.6M11.8 15.3l-.9-5.6-3.2 1.7-1 3.2M10.9 9.7l3.6 2.8 3.2.6" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>',
  STAY: '<rect x="6.5" y="6.5" width="11" height="11" rx="2.5" fill="currentColor"/>',
  BREAK: '<rect x="7" y="6" width="3.5" height="12" rx="1" fill="currentColor"/><rect x="13.5" y="6" width="3.5" height="12" rx="1" fill="currentColor"/>',
  GAP: '<path d="M4 9a12 12 0 0 1 16 0M7.5 12.5a7 7 0 0 1 9 0" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17" r="2" fill="currentColor"/><path d="M4 4l16 16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
}

/** The web's colours: a drive blue, a walk green, standing amber, a break or no signal slate. */
export const MOVEMENT_COLORS: Record<MovementMode | "BREAK" | "GAP", string> = {
  DRIVE: "#1d4ed8",
  WALK: "#0d8a4a",
  STAY: "#b45309",
  BREAK: "#64748b",
  GAP: "#64748b",
}

export type CompassPoint = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW"

/** The nearest of the eight points of the compass. */
export function compassPoint(degrees: number): CompassPoint {
  const points: CompassPoint[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
  return points[Math.round((((degrees % 360) + 360) % 360) / 45) % 8]
}
