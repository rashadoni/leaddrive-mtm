import { readSyncCache, type SyncRecord } from "./sync-cache"

/**
 * Read-side selectors for the durable sync cache (services/sync-cache.ts).
 *
 * The cache is WRITTEN by the app lifecycle (runtime/AndroidApp.tsx calls
 * pullAndApplySync after every outbox flush) but until now no screen READ it,
 * so a field rep who lost connectivity saw an empty screen instead of their
 * last-synced work. These selectors close that gap: screens call them as a
 * fallback when the live fetch fails on the network, so the last-synced data
 * stays visible offline.
 *
 * The selectors map the raw sync-pull entity shape (see the server route
 * src/app/api/v1/mtm/mobile/sync/pull/route.ts) onto the shape each screen
 * already renders, and enrich foreign keys (customerId → customer name) from
 * sibling cached entities so the offline view isn't degraded to bare ids.
 */

export interface CachedTask {
  id: string
  title: string
  description?: string
  status: string
  priority: string
  dueDate?: string
  customer?: { name: string; address?: string }
}

function str(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  const s = String(value)
  return s.length > 0 ? s : undefined
}

/**
 * Map one cached `tasks` record to the TasksScreen `Task` shape. The sync-pull
 * task carries a bare `customerId`; when the matching customer is present in the
 * cache we hydrate `customer.name`/`address` so the offline card matches online.
 */
export function mapCachedTask(
  record: SyncRecord,
  customersById?: Map<string, SyncRecord>,
): CachedTask {
  const customerId = str(record.customerId)
  const customer = customerId ? customersById?.get(customerId) : undefined
  const name = customer ? str(customer.name) : undefined
  return {
    id: String(record.id),
    title: str(record.title) ?? "",
    description: str(record.description),
    status: str(record.status) ?? "",
    priority: str(record.priority) ?? "MEDIUM",
    dueDate: str(record.dueDate),
    customer: name ? { name, address: str(customer!.address) } : undefined,
  }
}

/**
 * Load the agent's last-synced tasks from the durable cache, hydrated with the
 * cached customer names. Returns [] when nothing has been synced for this
 * (tenant, agent) scope. Never throws for a cache miss — callers use this as an
 * offline fallback, not a primary source.
 */
export async function readOfflineTasks(
  tenantId: string | null | undefined,
  agentId: string | null | undefined,
): Promise<CachedTask[]> {
  const state = await readSyncCache(tenantId, agentId)
  const tasks = state.entities.tasks ?? []
  const customersById = new Map(
    (state.entities.customers ?? []).map((customer) => [String(customer.id), customer] as const),
  )
  return tasks.map((task) => mapCachedTask(task, customersById))
}

export interface CachedRoutePoint {
  id: string
  orderIndex: number
  status: string
  plannedTime?: string
  visitedAt?: string
  customer: { id: string; name: string; address?: string; latitude?: number; longitude?: number }
}

export interface CachedRoute {
  id: string
  name?: string
  date: string
  status: string
  totalPoints: number
  visitedPoints: number
  points: CachedRoutePoint[]
}

const ACTIVE_ROUTE_STATUS = new Set(["PLANNED", "IN_PROGRESS"])

function num(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

/**
 * Map one cached route point. The route projection the server sends embeds only
 * id/name/address/code for the customer — deliberately, it is a frozen v1
 * contract — so coordinates come from the separately cached `customers`
 * collection, the same join `mapCachedTask` uses for names.
 *
 * Without that join every offline point looked like a customer with no
 * coordinates: the screen printed "координаты не заданы" on all of them and
 * refused the check-in with a reason that was not true.
 */
function mapCachedRoutePoint(
  record: SyncRecord,
  customersById?: Map<string, SyncRecord>,
): CachedRoutePoint {
  const embedded = (record.customer ?? {}) as Record<string, unknown>
  const id = str(embedded.id) ?? str(record.customerId) ?? ""
  const cached = id ? customersById?.get(id) : undefined
  return {
    id: String(record.id),
    orderIndex: Number(record.orderIndex ?? 0),
    status: str(record.status) ?? "",
    plannedTime: str(record.plannedTime),
    visitedAt: str(record.visitedAt),
    customer: {
      id,
      name: str(embedded.name) ?? (cached ? str(cached.name) ?? "" : ""),
      address: str(embedded.address) ?? (cached ? str(cached.address) : undefined),
      latitude: num(cached?.latitude),
      longitude: num(cached?.longitude),
    },
  }
}

export function mapCachedRoute(
  record: SyncRecord,
  customersById?: Map<string, SyncRecord>,
): CachedRoute {
  const points = Array.isArray(record.points)
    ? (record.points as SyncRecord[]).map((point) => mapCachedRoutePoint(point, customersById))
    : []
  return {
    id: String(record.id),
    name: str(record.name),
    date: str(record.date) ?? "",
    status: str(record.status) ?? "",
    totalPoints: points.length,
    visitedPoints: points.filter((point) => point.status === "VISITED").length,
    points,
  }
}

/**
 * Pick the route RouteScreen would show: an active route (PLANNED/IN_PROGRESS)
 * dated today or later, most-recent first. Mirrors the online selection in
 * RouteScreen.fetchRoute so the offline view can't surface a stale/past route.
 */
export function selectActiveRoute(routes: SyncRecord[], now: Date): SyncRecord | null {
  const midnight = new Date(now)
  midnight.setHours(0, 0, 0, 0)
  const active = routes.filter((route) => {
    const raw = str(route.date)
    if (!raw) return false
    const date = new Date(raw)
    return !Number.isNaN(date.getTime()) && date >= midnight && ACTIVE_ROUTE_STATUS.has(String(route.status))
  })
  active.sort((a, b) => new Date(String(b.date)).getTime() - new Date(String(a.date)).getTime())
  return active[0] ?? null
}

/**
 * Load the agent's active route from the durable cache, or null when nothing
 * active is cached for the scope. Used as an offline fallback by RouteScreen.
 */
export async function readOfflineRoute(
  tenantId: string | null | undefined,
  agentId: string | null | undefined,
  now: Date = new Date(),
): Promise<CachedRoute | null> {
  const state = await readSyncCache(tenantId, agentId)
  const active = selectActiveRoute(state.entities.routes ?? [], now)
  if (!active) return null
  const customersById = new Map(
    (state.entities.customers ?? []).map((customer) => [String(customer.id), customer] as const),
  )
  return mapCachedRoute(active, customersById)
}

export interface CachedOrganization {
  id: string
  name: string
  code?: string
  objectType?: string
  category?: string
  status?: string
  address?: string
  region?: string
  administrativeDistrict?: string
  locality?: string
  cityDistrict?: string
  city?: string
  district?: string
  specialization?: string
  organizationKind?: string
  territoryCode?: string
  managingManagerId?: string
  phone?: string
}

export interface OfflineOrganizationFilters {
  search?: string
  category?: string
  status?: string
  objectType?: string
  region?: string
  administrativeDistrict?: string
  locality?: string
  cityDistrict?: string
  specialization?: string
  organizationKind?: string
  territoryCode?: string
  managingManagerId?: string
  direction?: "asc" | "desc"
}

/**
 * Map a cached `customers` record to the Organizations screen shape. Counts
 * and related agent names remain online-only, while the complete published
 * master-data slice stays usable during fieldwork without connectivity.
 */
export function mapCachedOrganization(record: SyncRecord): CachedOrganization {
  return {
    id: String(record.id),
    name: str(record.name) ?? "",
    code: str(record.code),
    objectType: str(record.objectType),
    category: str(record.category),
    status: str(record.status),
    address: str(record.address),
    region: str(record.region),
    administrativeDistrict: str(record.administrativeDistrict),
    locality: str(record.locality),
    cityDistrict: str(record.cityDistrict),
    city: str(record.city),
    district: str(record.district),
    specialization: str(record.specialization),
    organizationKind: str(record.organizationKind),
    territoryCode: str(record.territoryCode),
    managingManagerId: str(record.managingManagerId),
    phone: str(record.phone),
  }
}

/** Client-side mirror of the server master-data search while offline. */
export function matchesOrganizationSearch(org: CachedOrganization, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [
    org.name, org.code, org.address, org.phone, org.city, org.region,
    org.administrativeDistrict, org.locality, org.cityDistrict,
    org.specialization, org.organizationKind, org.territoryCode,
  ].some(
    (value) => value != null && value.toLowerCase().includes(q),
  )
}

/** Filters that can be proven from the organization fields held in the cache. */
export function matchesOfflineOrganizationFilters(
  org: CachedOrganization,
  filters: OfflineOrganizationFilters,
): boolean {
  if (filters.search && !matchesOrganizationSearch(org, filters.search)) return false
  const exactFields: Array<keyof Omit<OfflineOrganizationFilters, "search" | "direction">> = [
    "category",
    "status",
    "objectType",
    "region",
    "administrativeDistrict",
    "locality",
    "cityDistrict",
    "specialization",
    "organizationKind",
    "territoryCode",
    "managingManagerId",
  ]
  return exactFields.every((field) => {
    const expected = filters[field]
    if (!expected) return true
    return String(org[field] ?? "").toLocaleLowerCase() === expected.toLocaleLowerCase()
  })
}

/**
 * Load the agent's assigned organizations from the durable cache, filtered by
 * the same search terms the server honours and sorted by name. Used as the
 * offline fallback for the Organizations screen.
 */
export async function readOfflineOrganizations(
  tenantId: string | null | undefined,
  agentId: string | null | undefined,
  searchOrFilters?: string | OfflineOrganizationFilters,
): Promise<CachedOrganization[]> {
  const state = await readSyncCache(tenantId, agentId)
  const list = (state.entities.customers ?? []).map(mapCachedOrganization)
  const filters = typeof searchOrFilters === "string"
    ? { search: searchOrFilters }
    : searchOrFilters ?? {}
  const filtered = list.filter((org) => matchesOfflineOrganizationFilters(org, filters))
  const direction = filters.direction === "desc" ? -1 : 1
  return filtered.sort((a, b) => direction * a.name.localeCompare(b.name))
}

export interface CachedContact {
  id: string
  name: string
  specialty?: string
  type?: string
  category?: string
  phone?: string
  workplace?: string
}

/**
 * Map a cached `contacts` record (from the sync-pull contacts entity) to the
 * ContactsList shape. GAP-003 sync records carry the full phone set and current
 * workplaces, so the offline row remains useful instead of falling back to the
 * old flat snapshot.
 */
export function mapCachedContact(record: SyncRecord): CachedContact {
  const workplaces = Array.isArray(record.workplaces) ? record.workplaces as SyncRecord[] : []
  const activeWorkplaces = workplaces.filter((workplace) => workplace.endedOn == null)
  const primary = activeWorkplaces.find((workplace) => workplace.isPrimary === true) ?? activeWorkplaces[0]
  const customer = primary?.customer && typeof primary.customer === "object" ? primary.customer as SyncRecord : undefined
  return {
    id: String(record.id),
    name: str(record.displayName) ?? "",
    specialty: str(record.specialtyName),
    type: str(record.type),
    category: str(record.category),
    phone: str(record.mobilePhone) ?? str(record.phone) ?? str(record.workPhone),
    workplace: str(customer?.name),
  }
}

/** Client-side mirror of the contacts server search (name/specialty/phone). */
export function matchesContactSearch(contact: CachedContact, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [contact.name, contact.specialty, contact.phone].some(
    (value) => value != null && value.toLowerCase().includes(q),
  )
}

/**
 * Load the agent's assigned contacts from the durable cache (populated once the
 * server sync-pull contacts entity is deployed), filtered by search and sorted
 * by name. Returns [] when nothing is cached — offline is a subset of online.
 */
export async function readOfflineContacts(
  tenantId: string | null | undefined,
  agentId: string | null | undefined,
  search?: string,
): Promise<CachedContact[]> {
  const state = await readSyncCache(tenantId, agentId)
  const list = (state.entities.contacts ?? []).map(mapCachedContact)
  const filtered = search ? list.filter((contact) => matchesContactSearch(contact, search)) : list
  return filtered.sort((a, b) => a.name.localeCompare(b.name))
}

/** Full GAP-003 contact snapshot from the scoped sync cache. The server ships
 * workplaces and pharma master fields in the contacts entity; pending review
 * and audit history stay online-authoritative and are intentionally absent. */
export async function readOfflineContactDetail(
  tenantId: string | null | undefined,
  agentId: string | null | undefined,
  contactId: string,
): Promise<{ record: SyncRecord; version: string | null; eligibleVisits: SyncRecord[] } | null> {
  const state = await readSyncCache(tenantId, agentId)
  const record = (state.entities.contacts ?? []).find((contact) => String(contact.id) === contactId)
  if (!record) return null
  const eligibleVisits = (state.entities.visits ?? [])
    .filter((visit) => String(visit.contactId ?? "") === contactId && String(visit.status ?? "") === "CHECKED_OUT")
    .sort((a, b) => String(b.checkInAt ?? "").localeCompare(String(a.checkInAt ?? "")))
    .slice(0, 25)
  return { record, version: state.version, eligibleVisits }
}
