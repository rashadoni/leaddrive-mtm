/**
 * The agent's own planner picks the day last.
 *
 * Owner, 2026-10-17, testing an agent's phone: «когда добавляю клиентов, он
 * сразу их добавляет в текущий день, нет возможности после выбора клиента
 * выбрать день». The planner asked for the date first and changing it threw
 * the chosen clients away; «Planı dəyiş» put every new client into the day it
 * was opened on. Decision the same day («День в конце»): the agent marks the
 * clients first, then chooses «Today · Tomorrow · Another date» at the bottom,
 * and every marked client goes into that day's route. In «Planı dəyiş» the day
 * is printed large with «Plan another day» next to it.
 *
 * The clients an agent marked are a basket that is not bound to a day yet. A
 * client is still only ever valid for a date the server said so for
 * (`planningTargetForDate`): a doctor confirmed for Monday is asked about again
 * before he moves to Tuesday, and the ones the server does not return for the
 * new day leave the basket — and the agent is told which.
 *
 * Everything here is pure; the screen wires it up.
 */

import {
  planningTargetForDate,
  shiftPlanningDateKey,
  type PlanningAssignedTarget,
  type PlanningDetailedRoute,
  type PlanningTarget,
} from "../../services/manager-planning"
import {
  PUBLISHED_ROUTE_EDITABLE_STATUSES,
  publishedRouteEditChanged,
  publishedStopIdentity,
  type PublishedRouteEditAvailability,
} from "../../services/published-route-edit"

function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

/**
 * The day the planner opens with. A caller passes a date only when the agent
 * already picked that day (another day on the calendar, the day of a waiting
 * draft); everything else opens without one. A day in the past is never
 * offered.
 */
export function selfPlanInitialDay(initialDate: string | null | undefined, today: string): string | null {
  return isDateKey(initialDate) && initialDate >= today ? initialDate : null
}

export type SelfPlanDayChoice = "today" | "tomorrow" | "other"

/** Which of the three answers to «which day?» a chosen day is. */
export function selfPlanDayChoice(day: string | null, today: string): SelfPlanDayChoice | null {
  if (!day) return null
  if (day === today) return "today"
  if (day === shiftPlanningDateKey(today, 1)) return "tomorrow"
  return "other"
}

/** The one-client lookup that asks the server about a marked client on another day. */
export function selfPlanRecheckQuery(stop: PlanningTarget, day: string): {
  kind: "contact" | "organization"
  date: string
  targetId: string
} {
  // By id only: a name search could miss a client the server would confirm,
  // and the agent would be told he is unavailable when he is not.
  const kind = stop.kind === "contact" ? "contact" : "organization"
  return {
    kind,
    date: day,
    targetId: kind === "contact" ? stop.contactId ?? stop.customerId : stop.customerId,
  }
}

/** Marked clients the server has not yet confirmed for `day`. */
export function selfPlanStopsToRecheck(basket: readonly PlanningAssignedTarget[], day: string): PlanningAssignedTarget[] {
  return basket.filter((stop) => stop.date !== day)
}

/**
 * Move the marked clients to `day`. `confirmed` holds what the server returned
 * for that day, by planner key (null: not returned). A client is kept only
 * when the server's row resolves for the day; the rest are dropped, in the
 * order the agent marked them, so the screen can name them.
 */
export function carrySelfPlanBasket(
  basket: readonly PlanningAssignedTarget[],
  day: string,
  confirmed: ReadonlyMap<string, PlanningTarget | null>,
): { kept: PlanningAssignedTarget[]; dropped: PlanningAssignedTarget[] } {
  const kept: PlanningAssignedTarget[] = []
  const dropped: PlanningAssignedTarget[] = []
  for (const stop of basket) {
    if (stop.date === day && planningTargetForDate(stop, day)) {
      kept.push(stop)
      continue
    }
    const match = confirmed.get(stop.key)
    const resolved = match ? planningTargetForDate(match, day) : null
    if (resolved) kept.push({ ...resolved, plannedTime: null, date: day })
    else dropped.push(stop)
  }
  return { kept, dropped }
}

/**
 * What saving does on the chosen day:
 * - `none`: no day chosen yet — nothing can be saved;
 * - `loading`: the day's routes or the clients' check are still on their way;
 * - `draft`: a new route, or the day's draft with the marked clients added;
 * - `published`: the day's route is live; the marked clients go to its end;
 * - `blocked`: the day has a route this planner may not change.
 */
export type SelfPlanDayMode = "none" | "loading" | "draft" | "published" | "blocked"

export function selfPlanDayMode(input: {
  day: string | null
  loading: boolean
  routes: readonly PlanningDetailedRoute[]
  /** Whether this agent may change the day's published route; null when there is none he may open. */
  publishedAvailability: PublishedRouteEditAvailability | null
  /** Days whose drafts the planner cannot treat as this agent's one draft. */
  conflictDates: readonly string[]
}): SelfPlanDayMode {
  if (!input.day) return "none"
  if (input.loading) return "loading"
  const day = input.day
  const active = input.routes.filter((route) => route.date === day && PUBLISHED_ROUTE_EDITABLE_STATUSES.includes(route.status))
  if (active.length > 0) {
    return input.publishedAvailability === "available" || input.publishedAvailability === "offline" ? "published" : "blocked"
  }
  if (input.conflictDates.includes(day)) return "blocked"
  return "draft"
}

/**
 * The chosen day's draft with the marked clients after it, for the save. A
 * client already on the draft is not added twice.
 */
export function selfPlanDayAssignments(
  assignments: readonly PlanningAssignedTarget[],
  basket: readonly PlanningAssignedTarget[],
  day: string,
): PlanningAssignedTarget[] {
  const onDay = new Set(assignments.filter((target) => target.date === day).map((target) => target.key))
  return [
    ...assignments,
    ...basket
      .filter((stop) => stop.date === day && !onDay.has(stop.key))
      .map((stop) => ({ ...stop, plannedTime: null, date: day })),
  ]
}

/**
 * A published day's stops with the marked clients at the end, as
 * UPDATE_PUBLISHED takes them. The day's own stops keep their order and
 * times; a client already on the route is not added again; every added stop
 * is new and untimed.
 */
export function appendSelfPlanBasket(
  stops: readonly PlanningAssignedTarget[],
  basket: readonly PlanningAssignedTarget[],
  day: string,
): PlanningAssignedTarget[] {
  const identities = new Set(stops.map(publishedStopIdentity))
  const added: PlanningAssignedTarget[] = []
  for (const stop of basket) {
    if (stop.date !== day) continue
    const identity = publishedStopIdentity(stop)
    if (identities.has(identity)) continue
    identities.add(identity)
    added.push({ ...stop, pointId: undefined, pointStatus: undefined, plannedTime: null, date: day })
  }
  return [...stops, ...added]
}

/**
 * «Plan another day» from a published day: the clients added during this
 * change that the published day does not have. They move to the new plan.
 */
export function publishedEditCarriedStops(
  original: readonly PlanningAssignedTarget[],
  edited: readonly PlanningAssignedTarget[],
): PlanningAssignedTarget[] {
  const originalIdentities = new Set(original.map(publishedStopIdentity))
  return edited.filter((stop) => !stop.pointId && !originalIdentities.has(publishedStopIdentity(stop)))
}

/**
 * Whether leaving the published day loses something besides the clients that
 * move along: a removed stop, a new order. Only then is the agent asked.
 */
export function publishedEditLosesChanges(
  original: readonly PlanningAssignedTarget[],
  edited: readonly PlanningAssignedTarget[],
): boolean {
  const carried = new Set(publishedEditCarriedStops(original, edited).map((stop) => stop.key))
  return publishedRouteEditChanged(original, edited.filter((stop) => !carried.has(stop.key)))
}
