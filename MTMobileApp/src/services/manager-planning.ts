/**
 * Pure mapper for the Manager planning workspace (GET /mobile/manager/planning).
 * The day's routes across the manager's scope, flattened for the list UI.
 */

export interface PlanningRoute {
  id: string
  name: string
  agentName: string
  status: string
  visited: number
  total: number
}

export type PlanningHorizon = 1 | 7
export type PlanningTargetKind = "organization" | "contact"

export interface PlanningAgent {
  id: string
  name: string
  role: string
}

export interface PlanningWorkplace {
  customerId: string
  organizationName?: string
  address?: string
  startedOn?: string | null
  endedOn?: string | null
  isPrimary: boolean
}

export interface PlanningTarget {
  key: string
  kind: PlanningTargetKind
  customerId: string
  contactId?: string
  name: string
  organizationName?: string
  address?: string
  eligible: boolean
  unavailableReason?: "NO_ACTIVE_WORKPLACE" | "CONTACT_INACTIVE" | "WORKPLACE_AMBIGUOUS" | "WORKPLACE_NOT_VALID_ON_DATE"
  contactStatus?: string
  workplaces?: PlanningWorkplace[]
  validOnDate?: string
  plannedTime?: string | null
}

export interface PlanningRouteAssignment {
  agentId: string
  role: string
}

export interface PlanningDetailedRoute {
  id: string
  date: string
  name: string | null
  notes: string | null
  version: number
  agentId: string
  primaryAgentId: string
  primaryIdentityConsistent: boolean
  agentName: string
  status: string
  visited: number
  total: number
  assignments: PlanningRouteAssignment[]
  points: PlanningTarget[]
}

export interface PlanningAssignedTarget extends PlanningTarget {
  date: string
}

export interface PlanningRouteWrite {
  date: string
  existingRouteId?: string
  expectedVersion?: number
  previousPointCount: number
  clearsExistingDraft: boolean
  points: Array<{ customerId: string; contactId?: string; plannedTime?: string | null }>
}

export interface PlanningDraftPublish {
  routeId: string
  date: string
  expectedVersion: number
}

function str(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  const s = String(value)
  return s.length > 0 ? s : undefined
}

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

export function toPlanningRoutes(raw: any): PlanningRoute[] {
  const routes = Array.isArray(raw?.routes) ? (raw.routes as any[]) : []
  return routes.map((r) => ({
    id: String(r?.id ?? ""),
    name: str(r?.name) ?? "",
    agentName: str(r?.agent?.name) ?? "",
    status: str(r?.status) ?? "",
    visited: num(r?.visitedPoints),
    total: num(r?.totalPoints),
  }))
}

function dateKey(value: unknown): string {
  const raw = str(value) ?? ""
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw)
  return match?.[1] ?? ""
}

/** Tenant date key when a valid timezone is available, otherwise device-local. */
export function planningTodayKey(now = new Date(), timezone?: string | null): string {
  if (timezone) {
    try {
      const parts = new Intl.DateTimeFormat("en", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(now)
      const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
      if (values.year && values.month && values.day) {
        return `${values.year}-${values.month}-${values.day}`
      }
    } catch {
      // Older Android Intl builds may reject an unknown tenant timezone.
    }
  }
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-")
}

export function shiftPlanningDateKey(value: string, days: number): string {
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) return value
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return parsed.toISOString().slice(0, 10)
}

export function planningDateKeys(anchor: string, horizon: PlanningHorizon): string[] {
  return Array.from({ length: horizon }, (_, index) => shiftPlanningDateKey(anchor, index))
}

function timezoneOffsetMinutes(timezone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const projected = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  )
  return Math.round((projected - at.getTime()) / 60_000)
}

/** Convert a tenant-local HH:mm choice into the ISO instant required by the route API. */
export function planningLocalTimeToIso(date: string, time: string, timezone?: string | null): string | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59 || minute % 30 !== 0) return null
  const [year, month, day] = date.split("-").map(Number)
  const naive = new Date(Date.UTC(year, month - 1, day, hour, minute))
  if (
    naive.getUTCFullYear() !== year || naive.getUTCMonth() !== month - 1 ||
    naive.getUTCDate() !== day || naive.getUTCHours() !== hour || naive.getUTCMinutes() !== minute
  ) return null
  const zone = timezone || "UTC"
  try {
    const first = new Date(naive.getTime() - timezoneOffsetMinutes(zone, naive) * 60_000)
    const resolved = new Date(naive.getTime() - timezoneOffsetMinutes(zone, first) * 60_000)
    return resolved.toISOString()
  } catch {
    return naive.toISOString()
  }
}

/** Human HH:mm for either a server ISO instant or a legacy HH:mm value. */
export function planningTimeLabel(value?: string | null, timezone?: string | null): string {
  if (!value) return ""
  if (/^\d{2}:\d{2}$/.test(value)) return value
  const instant = new Date(value)
  if (Number.isNaN(instant.getTime())) return ""
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone || "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(instant)
  } catch {
    return `${String(instant.getUTCHours()).padStart(2, "0")}:${String(instant.getUTCMinutes()).padStart(2, "0")}`
  }
}

/** Converts a legacy arbitrary minute value to the nearest user-selectable slot. */
export function normalizePlanningTimeSlot(value?: string | null): string | null {
  if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null
  const [hours, minutes] = value.split(":").map(Number)
  const rounded = Math.min((23 * 60) + 30, Math.round(((hours * 60) + minutes) / 30) * 30)
  return `${String(Math.floor(rounded / 60)).padStart(2, "0")}:${String(rounded % 60).padStart(2, "0")}`
}

function localMinutes(now: Date, timezone?: string | null): number {
  if (timezone) {
    try {
      const parts = new Intl.DateTimeFormat("en", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).formatToParts(now)
      const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
      const hour = Number(values.hour)
      const minute = Number(values.minute)
      if (Number.isInteger(hour) && Number.isInteger(minute)) return (hour * 60) + minute
    } catch {
      // Fall through to the device clock when the tenant timezone is invalid.
    }
  }
  return (now.getHours() * 60) + now.getMinutes()
}

function halfHourSlotAtOrAfter(minutes: number): string | null {
  const rounded = Math.ceil(minutes / 30) * 30
  if (rounded < 0 || rounded > (23 * 60) + 30) return null
  return `${String(Math.floor(rounded / 60)).padStart(2, "0")}:${String(rounded % 60).padStart(2, "0")}`
}

/**
 * Next valid 30-minute route slot.
 *
 * New visits planned for the tenant's current day get a small operational
 * lead time; this prevents a late-day planner session from silently creating
 * a morning visit. Existing draft times are never mutated by this helper.
 */
export function nextPlanningTime(
  targets: PlanningAssignedTarget[],
  date: string,
  timezone?: string | null,
  now: Date = new Date(),
): string | null {
  const used = targets
    .filter((target) => target.date === date)
    .map((target) => normalizePlanningTimeSlot(planningTimeLabel(target.plannedTime, timezone)))
    .filter((value): value is string => value !== null)
    .map((value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3)))
  const nextAfterLastVisit = used.length > 0 ? Math.max(...used) + 30 : 9 * 60
  const isToday = date === planningTodayKey(now, timezone)
  // A new visit must leave at least 30 minutes from the tenant's actual
  // local clock. Rounding up preserves the server's half-hour contract.
  const earliestToday = isToday ? localMinutes(now, timezone) + 30 : 0
  return halfHourSlotAtOrAfter(Math.max(nextAfterLastVisit, earliestToday))
}

export function toPlanningAgent(raw: any): PlanningAgent | null {
  const id = str(raw?.id)
  if (!id || raw?.role !== "AGENT") return null
  return {
    id,
    name: str(raw?.name) ?? "",
    role: "AGENT",
  }
}

export function planningTargetKey(customerId: string, contactId?: string | null): string {
  return contactId ? `contact:${contactId}` : `organization:${customerId}`
}

export function toPlanningOrganizationTarget(raw: any): PlanningTarget | null {
  const customerId = str(raw?.id)
  if (!customerId) return null
  return {
    key: planningTargetKey(customerId),
    kind: "organization",
    customerId,
    name: str(raw?.name) ?? "",
    address: str(raw?.address) ?? str(raw?.city),
    eligible: true,
  }
}

function toPlanningWorkplace(raw: any): PlanningWorkplace | null {
  const customer = raw?.customer ?? {}
  const customerId = str(customer?.id) ?? str(raw?.customerId)
  if (!customerId) return null
  return {
    customerId,
    organizationName: str(customer?.name),
    address: str(customer?.address) ?? str(customer?.city),
    startedOn: str(raw?.startedOn) ?? null,
    endedOn: str(raw?.endedOn) ?? null,
    isPrimary: raw?.isPrimary === true,
  }
}

export function toPlanningContactTarget(raw: any): PlanningTarget | null {
  const contactId = str(raw?.id)
  if (!contactId) return null
  // The route API only rejects INACTIVE contacts. Other workflow statuses
  // (for example PROSPECT or MERGED) must remain selectable when their
  // workplace is valid for the route date.
  const status = str(raw?.status) ?? "INACTIVE"
  const rawWorkplaces: unknown[] = Array.isArray(raw?.workplaces) ? raw.workplaces : []
  const workplaces = rawWorkplaces
    .map(toPlanningWorkplace)
    .filter((workplace): workplace is PlanningWorkplace => workplace !== null)
  const soleWorkplace = workplaces.length === 1 ? workplaces[0] : undefined
  const name = str(raw?.displayName) ?? ""
  const eligible = status !== "INACTIVE" && workplaces.length > 0
  return {
    key: planningTargetKey(soleWorkplace?.customerId ?? "", contactId),
    kind: "contact",
    customerId: soleWorkplace?.customerId ?? "",
    contactId,
    name,
    organizationName: soleWorkplace?.organizationName,
    address: soleWorkplace?.address,
    eligible,
    contactStatus: status,
    workplaces,
    unavailableReason: status === "INACTIVE"
      ? "CONTACT_INACTIVE"
      : workplaces.length === 0
        ? "NO_ACTIVE_WORKPLACE"
        : workplaces.length > 1
          ? "WORKPLACE_AMBIGUOUS"
          : undefined,
  }
}

function workplaceValidOnDate(workplace: PlanningWorkplace, date: string): boolean {
  const startedOn = dateKey(workplace.startedOn)
  const endedOn = dateKey(workplace.endedOn)
  return (!startedOn || startedOn <= date) && (!endedOn || date < endedOn)
}

/** Resolve exactly one server-valid workplace for a contact on a route date. */
export function planningTargetForDate(target: PlanningTarget, date: string): PlanningTarget | null {
  if (!target.eligible) return null
  // Narrow v2 planner cards carry a server-evaluated date instead of the
  // historical workplace payload used by the legacy manager picker. Respect
  // it for every target kind so a card cannot be reused after the active day
  // changes while the next server lookup is still in flight.
  if (target.validOnDate && target.validOnDate !== date) return null
  if (target.kind === "organization") return target

  if (target.workplaces) {
    if (target.contactStatus === "INACTIVE") return null
    const valid = target.workplaces.filter((workplace) => workplaceValidOnDate(workplace, date))
    // The simplified mobile planner has no workplace picker. Never guess when
    // there is no valid workplace or no unique primary among several valid
    // workplaces. A unique server-marked primary is an explicit default.
    const primary = valid.filter((workplace) => workplace.isPrimary)
    const workplace = valid.length === 1 ? valid[0] : primary.length === 1 ? primary[0] : null
    if (!workplace) return null
    return {
      ...target,
      customerId: workplace.customerId,
      organizationName: workplace.organizationName,
      address: workplace.address,
      validOnDate: date,
      unavailableReason: undefined,
    }
  }

  // Route points already validated by the server may be reused only on their
  // original date. Without workplace windows, using them on another day would
  // be an unsupported guess.
  return target.validOnDate === date && target.customerId ? target : null
}

export function invalidPlanningAssignmentDates(targets: PlanningAssignedTarget[]): string[] {
  return [...new Set(targets
    .filter((target) => planningTargetForDate(target, target.date) === null)
    .map((target) => target.date))]
}

export function toPlanningDetailedRoute(raw: any): PlanningDetailedRoute | null {
  const id = str(raw?.id)
  if (!id) return null
  const routeDate = dateKey(raw?.date)
  const points = Array.isArray(raw?.points) ? raw.points : []
  const rawAssignments: unknown[] = Array.isArray(raw?.assignments) ? raw.assignments : []
  const assignments: PlanningRouteAssignment[] = rawAssignments.flatMap((assignmentRaw): PlanningRouteAssignment[] => {
    const assignment = assignmentRaw && typeof assignmentRaw === "object"
      ? assignmentRaw as Record<string, unknown>
      : {}
    const nestedAgent = assignment.agent && typeof assignment.agent === "object"
      ? assignment.agent as Record<string, unknown>
      : {}
    const agentId = str(assignment.agentId) ?? str(nestedAgent.id)
    const role = str(assignment.role)
    return agentId && role ? [{ agentId, role }] : []
  })
  const rawAgentId = str(raw?.agentId) ?? str(raw?.agent?.id) ?? ""
  const explicitPrimaryAgentId = assignments.find((assignment) => assignment.role === "PRIMARY")?.agentId
  const primaryAgentId = explicitPrimaryAgentId ?? rawAgentId
  const primaryIdentityConsistent = Boolean(primaryAgentId) && (!explicitPrimaryAgentId || !rawAgentId || explicitPrimaryAgentId === rawAgentId)
  const mappedPoints = points.flatMap((point: any): PlanningTarget[] => {
    const customer = point?.customer ?? {}
    const customerId = str(point?.customerId) ?? str(customer?.id)
    if (!customerId) return []
    const contactId = str(point?.contactId) ?? str(point?.contact?.id)
    const plannedTime = str(point?.plannedTime) ?? null
    if (contactId) {
      return [{
        key: planningTargetKey(customerId, contactId),
        kind: "contact",
        customerId,
        contactId,
        name: str(point?.contact?.displayName) ?? str(customer?.name) ?? "",
        organizationName: str(customer?.name),
        address: str(customer?.address) ?? str(customer?.city),
        eligible: true,
        validOnDate: routeDate,
        plannedTime,
      }]
    }
    return [{
      key: planningTargetKey(customerId),
      kind: "organization",
      customerId,
      name: str(customer?.name) ?? "",
      address: str(customer?.address) ?? str(customer?.city),
      eligible: true,
      plannedTime,
    }]
  })
  return {
    id,
    date: routeDate,
    name: str(raw?.name) ?? null,
    notes: str(raw?.notes) ?? null,
    version: num(raw?.version),
    agentId: rawAgentId,
    primaryAgentId,
    primaryIdentityConsistent,
    agentName: str(raw?.agent?.name) ?? "",
    status: str(raw?.status) ?? "",
    visited: num(raw?.visitedPoints),
    total: num(raw?.totalPoints) || mappedPoints.length,
    assignments,
    points: mappedPoints,
  }
}

export function isPrimaryPlanningRoute(route: PlanningDetailedRoute, agentId: string): boolean {
  return route.primaryIdentityConsistent && route.agentId === agentId && route.primaryAgentId === agentId
}

/**
 * Draft points are editable. Published/in-progress/completed/cancelled routes
 * remain server truth and are deliberately not folded into the mutable draft.
 */
export function editablePlanningTargets(routes: PlanningDetailedRoute[], agentId: string): PlanningAssignedTarget[] {
  const seen = new Set<string>()
  return routes.flatMap((route) => {
    if (route.status !== "DRAFT" || !route.date || !isPrimaryPlanningRoute(route, agentId)) return []
    return route.points.flatMap((target): PlanningAssignedTarget[] => {
      const cellKey = `${route.date}|${target.key}`
      if (seen.has(cellKey)) return []
      seen.add(cellKey)
      return [{ ...target, date: route.date }]
    })
  })
}

export function lockedPlanningTargetKeys(routes: PlanningDetailedRoute[]): string[] {
  return [...new Set(routes
    .filter((route) => route.status !== "DRAFT")
    .flatMap((route) => route.points.map((point) => point.key)))]
}

export function lockedPlanningTargetCells(routes: PlanningDetailedRoute[]): string[] {
  return [...new Set(routes
    .filter((route) => route.status !== "DRAFT")
    .flatMap((route) => route.points.map((point) => `${route.date}|${point.key}`)))]
}

/** Active published work blocks creation of a second route for that agent/day. */
export function lockedPlanningDates(routes: PlanningDetailedRoute[]): string[] {
  return [...new Set(routes
    .filter((route) => route.status === "PLANNED" || route.status === "IN_PROGRESS")
    .map((route) => route.date)
    .filter(Boolean))]
}

/** Drafts that cannot be safely treated as the selected agent's one primary draft. */
export function planningDraftConflictDates(routes: PlanningDetailedRoute[], agentId: string): string[] {
  const dates = new Set(routes.filter((route) => route.status === "DRAFT").map((route) => route.date))
  return [...dates].filter((date) => {
    const drafts = routes.filter((route) => route.date === date && route.status === "DRAFT")
    const primaryDrafts = drafts.filter((route) => isPrimaryPlanningRoute(route, agentId))
    return drafts.some((route) => !isPrimaryPlanningRoute(route, agentId)) ||
      primaryDrafts.length > 1 ||
      primaryDrafts.some((route) => route.version < 1)
  })
}

export function assignPlanningTarget(
  targets: PlanningAssignedTarget[],
  target: PlanningTarget,
  date: string,
): PlanningAssignedTarget[] {
  const existing = targets.find((item) => item.key === target.key && item.date === date)
  if (existing) return targets
  return [...targets, { ...target, date }]
}

export function removePlanningTarget(targets: PlanningAssignedTarget[], key: string, date?: string): PlanningAssignedTarget[] {
  return targets.filter((target) => target.key !== key || (date !== undefined && target.date !== date))
}

export function updatePlanningTargetTime(
  targets: PlanningAssignedTarget[],
  key: string,
  date: string,
  plannedTime: string | null,
): PlanningAssignedTarget[] {
  return targets.map((target) => target.key === key && target.date === date ? { ...target, plannedTime } : target)
}

export function movePlanningTarget(
  targets: PlanningAssignedTarget[],
  key: string,
  date: string,
  direction: -1 | 1,
): PlanningAssignedTarget[] {
  const dayTargets = targets.filter((target) => target.date === date)
  const index = dayTargets.findIndex((target) => target.key === key)
  const nextIndex = index + direction
  if (index < 0 || nextIndex < 0 || nextIndex >= dayTargets.length) return targets
  const reordered = [...dayTargets]
  ;[reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]]
  let cursor = 0
  return targets.map((target) => target.date === date ? reordered[cursor++] : target)
}

function targetToRoutePoint(target: PlanningTarget): { customerId: string; contactId?: string; plannedTime?: string | null } {
  return {
    customerId: target.customerId,
    ...(target.contactId ? { contactId: target.contactId } : {}),
    ...(target.plannedTime !== undefined ? { plannedTime: target.plannedTime } : {}),
  }
}

function sameRoutePoints(
  left: Array<{ customerId: string; contactId?: string; plannedTime?: string | null }>,
  right: Array<{ customerId: string; contactId?: string; plannedTime?: string | null }>,
): boolean {
  if (left.length !== right.length) return false
  return left.every((point, index) => {
    const other = right[index]
    return point.customerId === other.customerId &&
      (point.contactId ?? null) === (other.contactId ?? null) &&
      (point.plannedTime ?? null) === (other.plannedTime ?? null)
  })
}

/** Build writes only for dirty days whose effective route content changed. */
export function buildPlanningRouteWrites(
  dates: string[],
  targets: PlanningAssignedTarget[],
  routes: PlanningDetailedRoute[],
  agentId: string,
  dirtyDates: ReadonlySet<string>,
): PlanningRouteWrite[] {
  const conflictDates = new Set(planningDraftConflictDates(routes, agentId))
  return dates.flatMap((date): PlanningRouteWrite[] => {
    if (!dirtyDates.has(date) || conflictDates.has(date)) return []
    const existingDrafts = routes.filter((route) =>
      route.date === date && route.status === "DRAFT" && isPrimaryPlanningRoute(route, agentId))
    if (existingDrafts.length > 1) return []
    const resolvedTargets = targets
      .filter((target) => target.date === date)
      .map((target) => planningTargetForDate(target, date))
    if (resolvedTargets.some((target) => target === null)) return []
    const points = (resolvedTargets as PlanningTarget[]).map(targetToRoutePoint)
    const existing = existingDrafts[0]
    if (!existing && points.length === 0) return []
    if (existing) {
      const previousPoints = existing.points.map(targetToRoutePoint)
      if (sameRoutePoints(points, previousPoints)) return []
      return [{
        date,
        existingRouteId: existing.id,
        expectedVersion: existing.version,
        previousPointCount: previousPoints.length,
        clearsExistingDraft: previousPoints.length > 0 && points.length === 0,
        points,
      }]
    }
    return [{ date, previousPointCount: 0, clearsExistingDraft: false, points }]
  })
}

/** Existing, unchanged primary drafts can be published without a destructive PUT. */
export function publishablePlanningDrafts(
  dates: string[],
  routes: PlanningDetailedRoute[],
  agentId: string,
  writeDates: ReadonlySet<string>,
): PlanningDraftPublish[] {
  const allowedDates = new Set(dates)
  const conflictDates = new Set(planningDraftConflictDates(routes, agentId))
  return routes.flatMap((route): PlanningDraftPublish[] => {
    if (!allowedDates.has(route.date) || writeDates.has(route.date) || conflictDates.has(route.date)) return []
    if (route.status !== "DRAFT" || !isPrimaryPlanningRoute(route, agentId)) return []
    if (route.points.length === 0 || route.version < 1) return []
    return [{ routeId: route.id, date: route.date, expectedVersion: route.version }]
  })
}

/** Re-check fresh server rows immediately before any create/update request. */
export function planningWriteConflictDates(
  writes: PlanningRouteWrite[],
  freshRoutes: PlanningDetailedRoute[],
  agentId: string,
): string[] {
  const conflicts = new Set(planningDraftConflictDates(freshRoutes, agentId))
  for (const write of writes) {
    const dayRoutes = freshRoutes.filter((route) => route.date === write.date)
    if (dayRoutes.some((route) => route.status === "PLANNED" || route.status === "IN_PROGRESS")) {
      conflicts.add(write.date)
      continue
    }
    const primaryDrafts = dayRoutes.filter((route) => route.status === "DRAFT" && isPrimaryPlanningRoute(route, agentId))
    if (write.existingRouteId) {
      const current = primaryDrafts.find((route) => route.id === write.existingRouteId)
      if (primaryDrafts.length !== 1 || !current || current.version !== write.expectedVersion) conflicts.add(write.date)
    } else if (primaryDrafts.length > 0 || dayRoutes.some((route) => route.status === "DRAFT")) {
      conflicts.add(write.date)
    }
  }
  return [...conflicts]
}

/** Revalidate publish-only drafts so retry never publishes a stale version. */
export function planningPublishConflictDates(
  drafts: PlanningDraftPublish[],
  freshRoutes: PlanningDetailedRoute[],
  agentId: string,
): string[] {
  const conflicts = new Set<string>()
  for (const draft of drafts) {
    const dayRoutes = freshRoutes.filter((route) => route.date === draft.date)
    const primaryDrafts = dayRoutes.filter((route) => route.status === "DRAFT" && isPrimaryPlanningRoute(route, agentId))
    const current = primaryDrafts.find((route) => route.id === draft.routeId)
    if (
      planningDraftConflictDates(dayRoutes, agentId).length > 0 ||
      primaryDrafts.length !== 1 ||
      !current ||
      current.version !== draft.expectedVersion ||
      current.points.length === 0
    ) {
      conflicts.add(draft.date)
    }
  }
  return [...conflicts]
}
