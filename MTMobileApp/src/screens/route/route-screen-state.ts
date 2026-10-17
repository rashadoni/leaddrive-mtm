export type RouteDataOrigin = "none" | "live" | "cache"
export type RouteLoadIssue = "none" | "offline" | "timeout"

export type RouteBannerMode = "cached" | "offline-retained" | "slow-retained" | null
export type RouteEmptyMode = "loading" | "offline-unavailable" | "slow-unavailable" | "awaiting-approval" | "no-route" | null

export interface RouteScreenPresentation {
  banner: RouteBannerMode
  empty: RouteEmptyMode
}

/**
 * Keeps route availability and connection copy honest. A cached route may be
 * called saved; a previously loaded in-memory route may only be called
 * retained; and a failed request with no data must render a retryable empty
 * state instead of an offline banner that claims a route exists.
 */
export function routeScreenPresentation({
  loading,
  hasRoute,
  routeOrigin,
  issue,
  awaitingApproval = false,
}: {
  loading: boolean
  hasRoute: boolean
  routeOrigin: RouteDataOrigin
  issue: RouteLoadIssue
  /** Today has a route that is saved but not approved yet (see below). */
  awaitingApproval?: boolean
}): RouteScreenPresentation {
  if (!hasRoute) {
    if (loading) return { banner: null, empty: "loading" }
    if (issue === "offline") return { banner: null, empty: "offline-unavailable" }
    if (issue === "timeout") return { banner: null, empty: "slow-unavailable" }
    if (awaitingApproval) return { banner: null, empty: "awaiting-approval" }
    return { banner: null, empty: "no-route" }
  }

  if (routeOrigin === "cache") return { banner: "cached", empty: null }
  if (issue === "offline") return { banner: "offline-retained", empty: null }
  if (issue === "timeout") return { banner: "slow-retained", empty: null }
  return { banner: null, empty: null }
}

/**
 * Whether today has a route the server holds as a draft with stops in it.
 *
 * Tablet in the field, 2026-10-06: an agent who may not publish his own routes
 * built today's route, read «Marşrut yadda saxlanıldı», went back — and the
 * Route tab still said «Bu gün marşrut yoxdur» and offered to build a route
 * again. The route was on the server all along, as a draft waiting for the
 * manager; the same read that fills this tab had returned it, and the tab
 * dropped it for not being PLANNED. A saved route that is not approved yet is
 * not «no route», and the screen must say which of the two it is.
 *
 * A draft with no stops is not a route anyone is waiting on: the agent took
 * everything out again. The server sends `date` as an ISO string; only its
 * calendar day is compared, as everywhere else on this screen.
 */
export function routeAwaitsApproval(routes: unknown, today: string): boolean {
  if (!Array.isArray(routes)) return false
  return routes.some((candidate) => {
    if (!candidate || typeof candidate !== "object") return false
    const route = candidate as { status?: unknown; date?: unknown; totalPoints?: unknown; points?: unknown }
    if (route.status !== "DRAFT") return false
    if (typeof route.date !== "string" || route.date.slice(0, 10) !== today) return false
    const stops = Array.isArray(route.points)
      ? route.points.length
      : typeof route.totalPoints === "number" ? route.totalPoints : 0
    return stops > 0
  })
}

/** One stop of a route that waits for approval, as the Route tab lists it. */
export interface AwaitingRouteStop {
  key: string
  /** Who is visited: the doctor if the stop names one, otherwise the organization. */
  name: string
  /** Where: the organization when the stop names a doctor, and the address. */
  place: string
}

/**
 * The stops of today's route that waits for approval, in the agent's order.
 *
 * 2026-10-07, the owner's phone: the Route tab said «waits for approval» and
 * showed nothing of the route itself; the planner had just closed, so the
 * clients the agent picked and their order were nowhere on the phone — «всё ты
 * удалил, ничего не осталось». The same read that says a route is waiting
 * carries its stops; an empty list here only means the read came without them.
 */
export function awaitingRouteStops(routes: unknown, today: string): AwaitingRouteStop[] {
  if (!Array.isArray(routes)) return []
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "")
  for (const candidate of routes) {
    if (!candidate || typeof candidate !== "object") continue
    const route = candidate as { status?: unknown; date?: unknown; points?: unknown }
    if (route.status !== "DRAFT" || typeof route.date !== "string" || route.date.slice(0, 10) !== today) continue
    if (!Array.isArray(route.points) || route.points.length === 0) continue
    return route.points
      .filter((point): point is Record<string, unknown> => Boolean(point) && typeof point === "object")
      .map((point, index) => {
        const customer = (point.customer && typeof point.customer === "object" ? point.customer : {}) as Record<string, unknown>
        const contact = (point.contact && typeof point.contact === "object" ? point.contact : {}) as Record<string, unknown>
        const person = text(contact.displayName)
        const organization = text(customer.name)
        const address = [text(customer.address), text(customer.city)].filter(Boolean).join(", ")
        return {
          order: typeof point.orderIndex === "number" && Number.isFinite(point.orderIndex) ? point.orderIndex : index,
          stop: {
            key: text(point.id) || `stop-${index}`,
            name: person || organization,
            place: [person ? organization : "", address].filter(Boolean).join(" · "),
          },
        }
      })
      .filter((item) => item.stop.name)
      .sort((left, right) => left.order - right.order)
      .map((item) => item.stop)
  }
  return []
}

/** Where a stop stands in the agent's day, as its row says it. */
export type RouteStopState = "visited" | "skipped" | "visiting" | "planned"

/**
 * Owner, 2026-10-07, about the route on the phone: «не показывает, в каком
 * клиенте уже был, закончил визит, в каком продолжает, в каком ещё не был».
 * The first and the last were on the screen; the stop being visited was not —
 * the list dropped it for the length of the visit, so the sequence had a hole
 * exactly where the agent stood. An open visit outranks what the server last
 * said about the stop: the check-in may not have reached it yet.
 */
export function routeStopState(
  point: { id: string; status?: string | null },
  visitingPointId: string | null | undefined,
): RouteStopState {
  if (visitingPointId && point.id === visitingPointId) return "visiting"
  if (point.status === "VISITED") return "visited"
  if (point.status === "SKIPPED") return "skipped"
  return "planned"
}

/**
 * The stop still ahead that is closest to the agent — «какой ближе».
 *
 * Only where it tells him something: at least two stops ahead have a known
 * distance. With one, «nearest» is the only choice; with none, a guess.
 */
export function nearestPendingStopId(
  points: ReadonlyArray<{ id: string; status?: string | null; distanceMeters?: number | null }>,
  visitingPointId: string | null | undefined,
): string | null {
  const ahead = points.filter((point) => (
    routeStopState(point, visitingPointId) === "planned"
    && typeof point.distanceMeters === "number" && Number.isFinite(point.distanceMeters) && point.distanceMeters >= 0
  ))
  if (ahead.length < 2) return null
  return ahead.reduce((nearest, point) => (
    (point.distanceMeters as number) < (nearest.distanceMeters as number) ? point : nearest
  )).id
}

export type RouteActionPanelState =
  | "loading"
  | "visit"
  | "point"
  | "gate-workday"
  | "gate-route"
  | "gate-paused"
  | "route-unknown"
  | "finished"

/**
 * Picks what the action panel may say, and says nothing until it knows.
 *
 * Galaxy S23, 2026-09-14: right after opening the Route tab the panel read
 * «Marşrutun başlanması gözlənilir» and asked for «Marşruta başla» beside
 * «Marşrut və ziyarətlər yüklənir…» and «0 dayanacaq». The route was already
 * IN_PROGRESS; a few seconds later the real panel replaced the order. A null
 * route while the first request runs is not a route that waits to start, an
 * unread workday store is not a day that was never started, and an unread
 * visit list is not a free hand to check in somewhere else. Each of those
 * shows a neutral wait instead of an instruction.
 *
 * An open visit is the one fact that outranks the rest: it is already on the
 * device, so a refetch or a slow store must never hide the visit controls.
 * Once everything is read, the choice is exactly the one the screen made
 * before — including a day the server said has no route.
 *
 * A read that failed is not such a day. Offline or after the 20 s timeout,
 * with no saved copy for today, the route may well be IN_PROGRESS on the
 * server; the list already says it could not load and offers a retry, so the
 * panel says nothing rather than ask for «Marşruta başla» (the tablet pane —
 * and the S23 held sideways, 823 dp — draws the panel without a route).
 * `routeKnownAbsent` is the outcome of the last read that finished, not the
 * live load issue: a timed refetch clears that issue the moment it starts,
 * and the old order would flash back for the whole request. The workday and
 * pause gates stay — they come from the device, not from the route.
 */
export function routeActionPanelState({
  loading,
  hasRoute,
  routeStatus,
  routeKnownAbsent,
  workdayHydrated,
  workdayActive,
  workdayPaused,
  hasActiveVisit,
  activeVisitKnown,
}: {
  loading: boolean
  hasRoute: boolean
  routeStatus: string | null | undefined
  routeKnownAbsent: boolean
  workdayHydrated: boolean
  workdayActive: boolean
  workdayPaused: boolean
  hasActiveVisit: boolean
  activeVisitKnown: boolean
}): RouteActionPanelState {
  if (hasActiveVisit) return "visit"
  if (!workdayHydrated || !activeVisitKnown || (loading && !hasRoute)) return "loading"
  // Redmi Pad SE, 2026-09-15: after the last visit the tab said «no route
  // today» and asked to start the route that had just been finished.
  if (hasRoute && routeStatus === "COMPLETED") return "finished"
  if (workdayActive && hasRoute && routeStatus === "IN_PROGRESS") return "point"
  if (workdayPaused) return "gate-paused"
  if (workdayActive) return hasRoute || routeKnownAbsent ? "gate-route" : "route-unknown"
  return "gate-workday"
}

export type RouteDockAction = "start-workday" | "start-route" | "open-visit" | "next-stop" | null

/**
 * The one action a phone keeps at the bottom of the Route screen.
 *
 * The clients of the route have the top of the screen; what used to be a card
 * above them is this. It is read off the panel's own state, so it can never
 * offer what the panel would not: while that state is still "loading" there
 * is no button at all, and a paused workday has none either.
 */
export function routeDockAction(state: RouteActionPanelState, hasNextStop: boolean): RouteDockAction {
  if (state === "gate-workday") return "start-workday"
  if (state === "gate-route") return "start-route"
  if (state === "visit") return "open-visit"
  if (state === "point" && hasNextStop) return "next-stop"
  return null
}

export interface RouteStopWho {
  /** Who is visited: the doctor if the stop names one, otherwise the organization. */
  name: string
  /** Where: the doctor's specialty and organization when the stop names one, and the address. */
  place: string
}

/**
 * Who a stop of the route is about, and where.
 *
 * 7 October 2026, owner's phone: he planned the day by doctors, and the route
 * showed him only clinics — in the list, in the visit panel, on Today. «Тут
 * нет названия врача, только название места». The server had been sending the
 * doctor with every stop all along; the screens printed the organization and
 * never looked at it.
 */
export function routeStopWho(point: {
  customer?: { name?: string | null; address?: string | null } | null
  contact?: { displayName?: string | null; specialtyName?: string | null } | null
} | null | undefined): RouteStopWho {
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "")
  const person = text(point?.contact?.displayName)
  const organization = text(point?.customer?.name)
  return {
    name: person || organization,
    place: [
      person ? text(point?.contact?.specialtyName) : "",
      person ? organization : "",
      text(point?.customer?.address),
    ].filter(Boolean).join(" · "),
  }
}


/**
 * Stops finished on this phone that the server may not know about yet.
 *
 * 2026-10-17, the owner's phone: after «Ziyarəti bitir» → «Təsdiq et» the
 * Route tab showed the same stop again as «Növbəti nöqtə» with «Artıq
 * buradayam» and 1/2 for about twenty seconds — until the sync reached the
 * server and the route read came back with the stop VISITED. That window
 * invites a second check-in at a clinic the agent has just left. A visit
 * checked out here is done here, at once; the server's word replaces it
 * when it arrives.
 *
 * Keyed by route point, holding the visit that finished it, so a visit the
 * server later refused can take its stop back (`withoutRefusedVisits`).
 */
export type LocallyFinishedStops = Readonly<Record<string, string>>

export function markStopFinishedLocally(
  finished: LocallyFinishedStops,
  visit: { id: string; routePointId?: string | null } | null | undefined,
): LocallyFinishedStops {
  if (!visit?.routePointId || finished[visit.routePointId] === visit.id) return finished
  return { ...finished, [visit.routePointId]: visit.id }
}

/**
 * Drop stops whose visit the server refused (a conflict in the outbox), or
 * whose check-out it refused and that is open again (`reopenedVisitId`).
 */
export function withoutRefusedVisits(
  finished: LocallyFinishedStops,
  refusedVisitIds: ReadonlySet<string>,
  reopenedVisitId?: string | null,
): LocallyFinishedStops {
  const kept = Object.entries(finished).filter(([, visitId]) => !refusedVisitIds.has(visitId) && visitId !== reopenedVisitId)
  return kept.length === Object.keys(finished).length ? finished : Object.fromEntries(kept)
}

/**
 * The route's stops with those finished on this phone counted as VISITED.
 * A stop the server already closed (VISITED, SKIPPED) keeps its own status.
 * The visit whose check-out is still waiting to sync counts too: it is over
 * for the agent, only the upload is left.
 */
export function withLocallyFinishedStops<T extends { id: string; status?: string | null }>(
  points: readonly T[],
  finished: LocallyFinishedStops,
  pendingCheckOutVisit?: { routePointId?: string | null; pendingCheckOut?: boolean } | null,
): T[] {
  const pendingPointId = pendingCheckOutVisit?.pendingCheckOut ? pendingCheckOutVisit.routePointId ?? null : null
  if (Object.keys(finished).length === 0 && !pendingPointId) return points as T[]
  return points.map((point) => {
    const done = finished[point.id] !== undefined || point.id === pendingPointId
    if (!done || point.status === "VISITED" || point.status === "SKIPPED") return point
    return { ...point, status: "VISITED" }
  })
}

/** The name the check-in notice says: the doctor when the stop names one, else the place. */
export function checkInNoticeName(point: Parameters<typeof routeStopWho>[0]): string {
  return routeStopWho(point).name
}
