/**
 * The working day drawn as a line with its stops on it, like a metro line:
 * the stops behind the agent are filled, the one he is at is ringed amber,
 * the next one green, the rest are hollow (owner approved the mockup,
 * 2026-10-18: «принимаю рекомендации»). The same line stands on «Bu gün»,
 * in «Marşrut» and under every agent in the manager's «Komanda».
 */
export type DayStopState = "done" | "visiting" | "next" | "planned"

/** A stop's place on the line, from the route point's status. */
export function dayStopState(status: string | undefined, visiting: boolean, next: boolean): DayStopState {
  if (visiting) return "visiting"
  if (status === "VISITED") return "done"
  if (next) return "next"
  return "planned"
}

/**
 * The longest line drawn under an agent. A plan longer than this keeps its
 * numbers beside the line; more stations would shrink to dots nobody reads.
 */
export const DAY_STRIP_MAX_STOPS = 12

/**
 * An agent's day for the manager, from the two counts the server sends:
 * visited stops first, the rest of the plan after them. Nothing is drawn for
 * an empty plan; a count above the plan never draws more stops than planned.
 */
export function dayStripStops(visited: number, planned: number): DayStopState[] {
  const total = Math.min(Math.max(0, Math.floor(planned)), DAY_STRIP_MAX_STOPS)
  if (total === 0) return []
  const done = planned > 0 ? Math.round((Math.min(Math.max(0, visited), planned) / planned) * total) : 0
  return Array.from({ length: total }, (_, index) => (index < done ? "done" : "planned"))
}
