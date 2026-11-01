import type { ManagerMovementMode, ManagerRouteDay } from "../../services/manager-location-truth"
import { upper } from "../../lib/upper"

/**
 * What an agent's card in «Komanda» says about his day, as a parcel in a
 * tracking app (owner, 2026-11-01, mockup approved with «Давай»): a ribbon
 * with his state, a marker on the day's road, «started» and «left» under it.
 * Only what the server knows is said; an older server leaves lines out.
 */
export type AgentDayRibbon = "closed" | "visiting" | "onTheWay" | "break" | null

export type AgentDayMarker =
  | { kind: "visiting"; minutes: number; name: string }
  | { kind: "moving"; mode: ManagerMovementMode }
  | null

export interface AgentDayCard {
  ribbon: AgentDayRibbon
  marker: AgentDayMarker
  started: { at: string; name: string | null } | null
  left: { count: number; now: string | null; next: string | null } | null
}

export function agentDayCard(input: {
  workdayStatus: string | null | undefined
  workdayStartedAt: string | null | undefined
  route: { planned: number; visited: number; skipped: number } | null | undefined
  routeDay: ManagerRouteDay | null | undefined
  /** His live point's movement; null when the point is old or absent. */
  liveMovement: ManagerMovementMode | null
  now: Date
}): AgentDayCard {
  const status = input.workdayStatus ?? null
  const open = status === "STARTED" || status === "PAUSED"
  const visiting = open ? input.routeDay?.visiting ?? null : null
  const remaining = input.route ? Math.max(0, input.route.planned - input.route.visited - input.route.skipped) : 0

  let ribbon: AgentDayRibbon = null
  if (status === "COMPLETED") ribbon = "closed"
  else if (visiting) ribbon = "visiting"
  else if (status === "PAUSED") ribbon = "break"
  else if (status === "STARTED" && (input.liveMovement === "DRIVE" || input.liveMovement === "WALK")) ribbon = "onTheWay"

  let marker: AgentDayMarker = null
  if (remaining > 0 && visiting) {
    const since = Date.parse(visiting.since)
    marker = { kind: "visiting", name: visiting.name, minutes: Number.isFinite(since) ? Math.max(0, Math.floor((input.now.getTime() - since) / 60_000)) : 0 }
  } else if (remaining > 0 && status === "STARTED" && input.liveMovement) {
    marker = { kind: "moving", mode: input.liveMovement }
  }

  const first = input.routeDay?.first ?? null
  const started = first
    ? { at: first.at, name: first.name }
    : input.workdayStartedAt ? { at: input.workdayStartedAt, name: null } : null

  const left = input.route && input.route.planned > 0
    ? { count: remaining, now: visiting?.name ?? null, next: input.routeDay?.next?.name ?? null }
    : null

  return { ribbon, marker, started, left }
}

/** Two letters for the avatar: first letters of the first two words. */
export function agentInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return upper(words.slice(0, 2).map((word) => Array.from(word)[0] ?? "").join(""))
}
