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
  customer: { id: string; name: string; address?: string }
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

function mapCachedRoutePoint(record: SyncRecord): CachedRoutePoint {
  const customer = (record.customer ?? {}) as Record<string, unknown>
  return {
    id: String(record.id),
    orderIndex: Number(record.orderIndex ?? 0),
    status: str(record.status) ?? "",
    plannedTime: str(record.plannedTime),
    visitedAt: str(record.visitedAt),
    customer: {
      id: str(customer.id) ?? "",
      name: str(customer.name) ?? "",
      address: str(customer.address),
    },
  }
}

export function mapCachedRoute(record: SyncRecord): CachedRoute {
  const points = Array.isArray(record.points)
    ? (record.points as SyncRecord[]).map(mapCachedRoutePoint)
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
  return active ? mapCachedRoute(active) : null
}
