/**
 * «Planı dəyiş»: changing a route that is already published.
 *
 * Owner, 2026-09-15: "I chose a route with these customers and published it,
 * and then I can't change it — can't pick another customer or remove one."
 * The planner froze every PLANNED/IN_PROGRESS day. The server now accepts
 * UPDATE_PUBLISHED (leaddrive-v2 #218) and keeps every stop that already has
 * field work: such a stop cannot be removed, cannot change its place relative
 * to the other such stops, and cannot be retimed.
 *
 * Everything here is pure, so the rules the screen enforces are tested
 * without rendering it. The server stays the authority; these checks only
 * stop the agent from composing a change the server is certain to refuse.
 */

import {
  isPrimaryPlanningRoute,
  type PlanningAssignedTarget,
  type PlanningDetailedRoute,
  type PlanningTarget,
} from "./manager-planning"

export const PUBLISHED_ROUTE_EDITABLE_STATUSES: readonly string[] = ["PLANNED", "IN_PROGRESS"]

/** The server refuses more stops than this in one route command. */
export const PUBLISHED_ROUTE_MAX_POINTS = 200

export type PublishedRouteEditAvailability = "available" | "offline" | "unavailable"

/**
 * Whether «Planı dəyiş» may be offered.
 *
 * Offline is refused, not queued: while the change waits for a connection the
 * agent keeps checking in at stops the change may remove or move, and the
 * server would then refuse it long after the agent stopped looking. A
 * connection state that is not yet known (null) is not treated as offline —
 * the request itself will tell.
 */
export function publishedRouteEditAvailability(input: {
  role?: string | null
  canPlanOwnRoutes: boolean
  agentId?: string | null
  routeAgentId?: string | null
  status?: string | null
  version?: number | null
  online: boolean | null
}): PublishedRouteEditAvailability {
  if (String(input.role ?? "").toUpperCase() !== "AGENT") return "unavailable"
  if (!input.canPlanOwnRoutes) return "unavailable"
  if (!input.agentId || input.routeAgentId !== input.agentId) return "unavailable"
  if (!input.status || !PUBLISHED_ROUTE_EDITABLE_STATUSES.includes(input.status)) return "unavailable"
  if (typeof input.version !== "number" || !Number.isInteger(input.version) || input.version < 1) return "unavailable"
  if (input.online === false) return "offline"
  return "available"
}

/**
 * The one published route of this agent on this day, if the planner may open
 * it for editing. Two active routes on one day, or a route where the agent is
 * only a participant, are not guessed at.
 */
export function publishedRouteForDay(
  routes: readonly PlanningDetailedRoute[],
  date: string,
  agentId: string,
): PlanningDetailedRoute | null {
  const active = routes.filter((route) => route.date === date && PUBLISHED_ROUTE_EDITABLE_STATUSES.includes(route.status))
  if (active.length !== 1) return null
  return isPrimaryPlanningRoute(active[0], agentId) ? active[0] : null
}

/**
 * A saved stop that field work has touched. A stop added during this edit has
 * no pointId and is never locked. A saved stop whose status the server did not
 * send is treated as locked: guessing "pending" could remove a visited stop.
 */
export function isPublishedStopLocked(stop: Pick<PlanningTarget, "pointId" | "pointStatus">): boolean {
  if (!stop.pointId) return false
  return stop.pointStatus !== "PENDING"
}

/** Server identity of a stop: the same doctor at another clinic is another stop. */
export function publishedStopIdentity(stop: Pick<PlanningTarget, "customerId" | "contactId">): string {
  return JSON.stringify([stop.customerId, stop.contactId ?? null])
}

/** The day's stops as the editor starts from them, in route order. */
export function publishedRouteEditStops(route: PlanningDetailedRoute): PlanningAssignedTarget[] {
  return route.points.map((point) => ({ ...point, date: route.date }))
}

export type PublishedRouteEditProblem = {
  code: "ROUTE_EMPTY" | "TOO_MANY" | "DUPLICATE" | "LOCKED_REMOVED" | "LOCKED_REORDERED" | "LOCKED_RETIMED"
  /** Planner keys (PlanningTarget.key) of the stops the problem is about. */
  keys: string[]
}

/**
 * The server's rules for a published route, checked before sending.
 * Returns null when the edited day may be sent.
 */
export function validatePublishedRouteEdit(
  original: readonly PlanningAssignedTarget[],
  edited: readonly PlanningAssignedTarget[],
): PublishedRouteEditProblem | null {
  if (edited.length === 0) return { code: "ROUTE_EMPTY", keys: [] }
  if (edited.length > PUBLISHED_ROUTE_MAX_POINTS) return { code: "TOO_MANY", keys: [] }

  const seen = new Set<string>()
  const duplicates = edited.filter((stop) => {
    const identity = publishedStopIdentity(stop)
    if (seen.has(identity)) return true
    seen.add(identity)
    return false
  })
  if (duplicates.length > 0) return { code: "DUPLICATE", keys: duplicates.map((stop) => stop.key) }

  const editedByIdentity = new Map(edited.map((stop) => [publishedStopIdentity(stop), stop]))
  const lockedOriginal = original.filter(isPublishedStopLocked)

  const removed = lockedOriginal.filter((stop) => !editedByIdentity.has(publishedStopIdentity(stop)))
  if (removed.length > 0) return { code: "LOCKED_REMOVED", keys: removed.map((stop) => stop.key) }

  // Pending stops may move around and between locked ones; the locked stops
  // must still come in the order the route had them.
  const lockedIdentities = new Set(lockedOriginal.map(publishedStopIdentity))
  const originalOrder = lockedOriginal.map(publishedStopIdentity)
  const editedOrder = edited.map(publishedStopIdentity).filter((identity) => lockedIdentities.has(identity))
  const reordered = lockedOriginal.filter((stop, index) => editedOrder[index] !== originalOrder[index])
  if (reordered.length > 0) return { code: "LOCKED_REORDERED", keys: reordered.map((stop) => stop.key) }

  const retimed = lockedOriginal.filter((stop) => {
    const current = editedByIdentity.get(publishedStopIdentity(stop))
    return (current?.plannedTime ?? null) !== (stop.plannedTime ?? null)
  })
  if (retimed.length > 0) return { code: "LOCKED_RETIMED", keys: retimed.map((stop) => stop.key) }

  return null
}

const PROBLEM_KEYS: Record<PublishedRouteEditProblem["code"], string> = {
  ROUTE_EMPTY: "managerShell.planEditEmpty",
  TOO_MANY: "managerShell.planEditTooMany",
  DUPLICATE: "managerShell.planEditDuplicate",
  LOCKED_REMOVED: "managerShell.planEditLockedRemoved",
  LOCKED_REORDERED: "managerShell.planEditLockedReordered",
  LOCKED_RETIMED: "managerShell.planEditLockedRetimed",
}

export function publishedRouteEditProblemKey(code: PublishedRouteEditProblem["code"]): string {
  return PROBLEM_KEYS[code]
}

export type PublishedRoutePoint = {
  customerId: string
  contactId: string | null
  plannedTime: string | null
}

/**
 * UPDATE_PUBLISHED points: array order is stop order, identity is
 * customerId + contactId, and there is no point id. A locked stop is sent with
 * the planned time exactly as the server gave it — omitting it would read as
 * "clear the time" and be refused as a retime.
 */
export function buildUpdatePublishedPoints(edited: readonly PlanningAssignedTarget[]): PublishedRoutePoint[] {
  return edited.map((stop) => ({
    customerId: stop.customerId,
    contactId: stop.contactId ?? null,
    plannedTime: stop.plannedTime ?? null,
  }))
}

/** False while the edited day still equals the published one. */
export function publishedRouteEditChanged(
  original: readonly PlanningAssignedTarget[],
  edited: readonly PlanningAssignedTarget[],
): boolean {
  const left = buildUpdatePublishedPoints(original)
  const right = buildUpdatePublishedPoints(edited)
  if (left.length !== right.length) return true
  return left.some((point, index) => (
    point.customerId !== right[index].customerId ||
    point.contactId !== right[index].contactId ||
    point.plannedTime !== right[index].plannedTime
  ))
}

/** Planner keys of the stops the server named by point id. */
export function publishedStopKeysForPointIds(
  stops: readonly PlanningTarget[],
  pointIds: readonly string[],
): string[] {
  const ids = new Set(pointIds)
  return stops.filter((stop) => stop.pointId && ids.has(stop.pointId)).map((stop) => stop.key)
}

/**
 * What the planner does after the server refused or could not confirm a
 * change:
 * - "reload-and-ask": the route changed under the agent; reload it and offer
 *   to start the change again on the fresh route;
 * - "restart-edit": reload and reopen the editor on fresh stops, marking the
 *   stops the server named;
 * - "keep-edit": the agent's change stays on screen to be corrected;
 * - "exit-edit": nothing to correct here; leave the editor and reload.
 */
export type PublishedRouteEditErrorAction = "reload-and-ask" | "restart-edit" | "keep-edit" | "exit-edit"

export type PublishedRouteEditErrorOutcome = {
  /** managerShell.* key of the message. */
  messageKey: string
  tone: "warning" | "error"
  action: PublishedRouteEditErrorAction
  /** Server code for the log; the agent sees only the message. */
  code: string
}

const OUTCOMES: Record<string, Omit<PublishedRouteEditErrorOutcome, "code">> = {
  ROUTE_VERSION_CONFLICT: { messageKey: "managerShell.planEditVersionConflict", tone: "warning", action: "reload-and-ask" },
  ROUTE_TRANSITION_INVALID: { messageKey: "managerShell.planEditRouteClosed", tone: "warning", action: "exit-edit" },
  MTM_ROUTE_NOT_FOUND: { messageKey: "managerShell.planEditRouteClosed", tone: "warning", action: "exit-edit" },
  ROUTE_VISITED_POINTS_LOCKED: { messageKey: "managerShell.planEditVisitedLocked", tone: "warning", action: "restart-edit" },
  ROUTE_POINT_CHANGE_PENDING: { messageKey: "managerShell.planEditChangePending", tone: "warning", action: "keep-edit" },
  MTM_ROUTE_SCOPE_DENIED: { messageKey: "managerShell.planEditForbidden", tone: "error", action: "exit-edit" },
  ROUTE_EDIT_FORBIDDEN: { messageKey: "managerShell.planEditForbidden", tone: "error", action: "exit-edit" },
  MTM_ROUTE_TARGET_ASSIGNMENT_REQUIRED: { messageKey: "managerShell.planEditTargetUnavailable", tone: "warning", action: "keep-edit" },
  MTM_ROUTE_REFERENCE_INVALID: { messageKey: "managerShell.planEditTargetUnavailable", tone: "warning", action: "keep-edit" },
  ROUTE_EMPTY: { messageKey: "managerShell.planEditEmpty", tone: "warning", action: "keep-edit" },
  MOBILE_ROUTE_COMMAND_DATE_OUTSIDE_HORIZON: { messageKey: "managerShell.planEditDateClosed", tone: "warning", action: "exit-edit" },
  MTM_ROUTE_NON_WORKING_DAY: { messageKey: "managerShell.planEditDateClosed", tone: "warning", action: "exit-edit" },
  ROUTE_POINT_TIME_CONFLICT: { messageKey: "managerShell.planEditTimeConflict", tone: "warning", action: "keep-edit" },
  ROUTE_CONFLICT: { messageKey: "managerShell.planEditConflict", tone: "warning", action: "keep-edit" },
  ROUTE_DUPLICATE: { messageKey: "managerShell.planEditConflict", tone: "warning", action: "keep-edit" },
  // A server deployed before UPDATE_PUBLISHED rejects the unknown command as
  // an invalid envelope. The app cannot tell that from its own malformed
  // request, and the message covers both: this server does not take the change.
  MOBILE_ROUTE_COMMAND_INVALID: { messageKey: "managerShell.planEditServerOutdated", tone: "warning", action: "exit-edit" },
  // Sent, but no answer: the operation stays in the journal under the same id
  // and a retry reaches the server's receipt instead of a second change.
  MOBILE_ROUTE_COMMAND_QUEUED: { messageKey: "managerShell.planEditNotConfirmed", tone: "warning", action: "keep-edit" },
  OFFLINE: { messageKey: "managerShell.planEditOffline", tone: "warning", action: "keep-edit" },
}

export function publishedRouteEditErrorOutcome(error: unknown): PublishedRouteEditErrorOutcome {
  const code = (error as { code?: unknown } | null)?.code
  const known = typeof code === "string" ? OUTCOMES[code] : undefined
  if (known && typeof code === "string") return { ...known, code }
  return {
    messageKey: "managerShell.planEditFailed",
    tone: "error",
    action: "keep-edit",
    code: typeof code === "string" && code ? code : "UNKNOWN",
  }
}

/** Every message key the outcomes can name; the i18n test reads this. */
export const PUBLISHED_ROUTE_EDIT_MESSAGE_KEYS: readonly string[] = [
  ...new Set([
    ...Object.values(OUTCOMES).map((outcome) => outcome.messageKey),
    ...Object.values(PROBLEM_KEYS),
    "managerShell.planEditFailed",
  ]),
]
