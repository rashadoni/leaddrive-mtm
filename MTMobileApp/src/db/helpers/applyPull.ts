/**
 * applyPull — apply a server sync-pull response into the local WatermelonDB.
 *
 * Strategy per entity:
 *   - updated[]: upsert (create if new, update if exists)
 *   - deleted[]: destroyPermanently from local DB (server soft-delete → client hard-delete)
 *   - route.points[]: replace-all for each updated route (route_points lack own updatedAt)
 *
 * All operations execute in a single database.write() call (SQLite transaction).
 */

import { Q, Model } from '@nozbe/watermelondb'
import { database } from '../database'
import type {
  Customer, SkuCategory, Sku,
  Route, RoutePoint,
  Visit, Order, Task,
} from '../models'
import type { OrderItem } from '../models/Order'

// ─── Server-side shape types (limited select from pull route) ────────────────

export interface ServerRoute {
  id: string
  organizationId: string
  agentId: string
  date: string           // ISO date string
  name: string | null
  status: string
  totalPoints: number
  visitedPoints: number
  startedAt: string | null
  completedAt: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  points?: ServerRoutePoint[]
}

export interface ServerRoutePoint {
  id: string
  routeId?: string
  customerId: string
  orderIndex: number
  status: string
  plannedTime: string | null
  updatedAt: string
}

export interface ServerCustomer {
  id: string
  name: string
  code: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  category: string
  phone: string | null
  updatedAt: string
}

export interface ServerSkuCategory {
  id: string
  name: string
  code: string | null
  parentId: string | null
  sortOrder: number
  updatedAt: string
}

export interface ServerSku {
  id: string
  code: string
  name: string
  brand: string | null
  unit: string
  packSize: number
  basePrice: number
  currency: string
  thumbnailUrl: string | null
  categoryId: string | null
  updatedAt: string
}

export interface ServerVisit {
  id: string
  customerId: string
  status: string
  checkInAt: string
  checkOutAt: string | null
  checkInLat: number | null
  checkInLng: number | null
  checkOutLat: number | null
  checkOutLng: number | null
  notes: string | null
  updatedAt: string
}

export interface ServerOrder {
  id: string
  orderNumber: string | null
  customerId: string
  visitId?: string | null
  status: string
  totalAmount: number
  notes: string | null
  items: unknown
  createdAt: string
  updatedAt: string
}

export interface ServerTask {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  dueDate: string | null
  customerId: string | null
  completedAt: string | null
  updatedAt: string
}

export interface SyncEntityChanges<T> {
  updated: T[]
  deleted: string[]
}

export interface SyncPullChanges {
  routes?: SyncEntityChanges<ServerRoute>
  customers?: SyncEntityChanges<ServerCustomer>
  skuCategories?: SyncEntityChanges<ServerSkuCategory>
  skus?: SyncEntityChanges<ServerSku>
  visits?: SyncEntityChanges<ServerVisit>
  orders?: SyncEntityChanges<ServerOrder>
  tasks?: SyncEntityChanges<ServerTask>
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ms = (iso: string | null | undefined): number | null =>
  iso ? new Date(iso).getTime() : null

const msRequired = (iso: string): number => new Date(iso).getTime()

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Apply a delta pull response to the local WatermelonDB in one write transaction.
 *
 * @param changes       The `changes` object from the /sync/pull response
 * @param context       Auth context — organizationId + agentId for new records
 */
export async function applyPull(
  changes: SyncPullChanges,
  context: { organizationId: string; agentId: string },
): Promise<void> {
  const { organizationId, agentId } = context

  await database.write(async () => {
    const batch: Model[] = []

    // ── Customers ──────────────────────────────────────────────────────
    if (changes.customers) {
      const col = database.collections.get<Customer>('customers')

      if (changes.customers.updated.length > 0) {
        const ids = changes.customers.updated.map(r => r.id)
        const existing = await col.query(Q.where('id', Q.oneOf(ids))).fetch()
        const existingMap = new Map(existing.map(r => [r.id, r]))

        for (const sr of changes.customers.updated) {
          const rec = existingMap.get(sr.id)
          if (rec) {
            batch.push(rec.prepareUpdate(r => {
              r.name = sr.name
              r.code = sr.code
              r.address = sr.address
              r.latitude = sr.latitude
              r.longitude = sr.longitude
              r.category = sr.category as Customer['category']
              r.phone = sr.phone
              r._raw.updated_at = msRequired(sr.updatedAt)
            }))
          } else {
            batch.push(col.prepareCreate(r => {
              r._raw.id = sr.id
              r.organizationId = organizationId
              r.name = sr.name
              r.code = sr.code
              r.address = sr.address
              r.latitude = sr.latitude
              r.longitude = sr.longitude
              r.category = sr.category as Customer['category']
              r.status = 'ACTIVE'
              r.phone = sr.phone
              r._raw.created_at = msRequired(sr.updatedAt)
              r._raw.updated_at = msRequired(sr.updatedAt)
            }))
          }
        }
      }

      for (const id of changes.customers.deleted) {
        try {
          const rec = await col.find(id)
          batch.push(rec.prepareDestroyPermanently())
        } catch { /* not found locally — ok */ }
      }
    }

    // ── SKU Categories ──────────────────────────────────────────────────
    if (changes.skuCategories) {
      const col = database.collections.get<SkuCategory>('sku_categories')

      if (changes.skuCategories.updated.length > 0) {
        const ids = changes.skuCategories.updated.map(r => r.id)
        const existing = await col.query(Q.where('id', Q.oneOf(ids))).fetch()
        const existingMap = new Map(existing.map(r => [r.id, r]))

        for (const sr of changes.skuCategories.updated) {
          const rec = existingMap.get(sr.id)
          if (rec) {
            batch.push(rec.prepareUpdate(r => {
              r.name = sr.name
              r.code = sr.code
              r.parentId = sr.parentId
              r.sortOrder = sr.sortOrder
              r._raw.updated_at = msRequired(sr.updatedAt)
            }))
          } else {
            batch.push(col.prepareCreate(r => {
              r._raw.id = sr.id
              r.organizationId = organizationId
              r.name = sr.name
              r.code = sr.code
              r.parentId = sr.parentId
              r.sortOrder = sr.sortOrder
              r.isActive = true
              r._raw.created_at = msRequired(sr.updatedAt)
              r._raw.updated_at = msRequired(sr.updatedAt)
            }))
          }
        }
      }
    }

    // ── SKUs ─────────────────────────────────────────────────────────────
    if (changes.skus) {
      const col = database.collections.get<Sku>('skus')

      if (changes.skus.updated.length > 0) {
        const ids = changes.skus.updated.map(r => r.id)
        const existing = await col.query(Q.where('id', Q.oneOf(ids))).fetch()
        const existingMap = new Map(existing.map(r => [r.id, r]))

        for (const sr of changes.skus.updated) {
          const rec = existingMap.get(sr.id)
          if (rec) {
            batch.push(rec.prepareUpdate(r => {
              r.code = sr.code
              r.name = sr.name
              r.brand = sr.brand
              r.unit = sr.unit
              r.packSize = sr.packSize
              r.basePrice = sr.basePrice
              r.currency = sr.currency
              r.thumbnailUrl = sr.thumbnailUrl
              r.categoryId = sr.categoryId
              r._raw.updated_at = msRequired(sr.updatedAt)
            }))
          } else {
            batch.push(col.prepareCreate(r => {
              r._raw.id = sr.id
              r.organizationId = organizationId
              r.code = sr.code
              r.name = sr.name
              r.brand = sr.brand
              r.unit = sr.unit
              r.packSize = sr.packSize
              r.basePrice = sr.basePrice
              r.currency = sr.currency
              r.thumbnailUrl = sr.thumbnailUrl
              r.categoryId = sr.categoryId
              r.isActive = true
              r._raw.created_at = msRequired(sr.updatedAt)
              r._raw.updated_at = msRequired(sr.updatedAt)
            }))
          }
        }
      }
    }

    // ── Routes + Route Points ─────────────────────────────────────────────
    if (changes.routes) {
      const routesCol = database.collections.get<Route>('routes')
      const pointsCol = database.collections.get<RoutePoint>('route_points')

      if (changes.routes.updated.length > 0) {
        const ids = changes.routes.updated.map(r => r.id)
        const existing = await routesCol.query(Q.where('id', Q.oneOf(ids))).fetch()
        const existingMap = new Map(existing.map(r => [r.id, r]))

        for (const sr of changes.routes.updated) {
          const rec = existingMap.get(sr.id)
          if (rec) {
            batch.push(rec.prepareUpdate(r => {
              r.name = sr.name
              r.status = sr.status as Route['status']
              r.totalPoints = sr.totalPoints
              r.visitedPoints = sr.visitedPoints
              r.startedAt = ms(sr.startedAt)
              r.completedAt = ms(sr.completedAt)
              r.notes = sr.notes
              r._raw.updated_at = msRequired(sr.updatedAt)
            }))
          } else {
            batch.push(routesCol.prepareCreate(r => {
              r._raw.id = sr.id
              r.organizationId = organizationId
              r.agentId = sr.agentId ?? agentId
              r.date = msRequired(sr.date)
              r.name = sr.name
              r.status = sr.status as Route['status']
              r.totalPoints = sr.totalPoints
              r.visitedPoints = sr.visitedPoints
              r.startedAt = ms(sr.startedAt)
              r.completedAt = ms(sr.completedAt)
              r.notes = sr.notes
              r._raw.created_at = msRequired(sr.createdAt ?? sr.updatedAt)
              r._raw.updated_at = msRequired(sr.updatedAt)
            }))
          }

          // Replace route_points for this route (replace-all strategy)
          if (sr.points) {
            // Soft-delete all existing points for this route
            const existingPoints = await pointsCol
              .query(Q.where('route_id', sr.id))
              .fetch()
            for (const p of existingPoints) {
              batch.push(p.prepareDestroyPermanently())
            }
            // Recreate from server data
            for (const sp of sr.points) {
              batch.push(pointsCol.prepareCreate(p => {
                p._raw.id = sp.id
                p.routeId = sr.id
                p.customerId = sp.customerId
                p.orderIndex = sp.orderIndex
                p.status = sp.status as RoutePoint['status']
                p.plannedTime = ms(sp.plannedTime)
                p.visitedAt = null
              }))
            }
          }
        }
      }

      for (const id of changes.routes.deleted) {
        try {
          const rec = await routesCol.find(id)
          batch.push(rec.prepareDestroyPermanently())
          // Also destroy child points
          const points = await pointsCol.query(Q.where('route_id', id)).fetch()
          for (const p of points) batch.push(p.prepareDestroyPermanently())
        } catch { /* not found locally */ }
      }
    }

    // ── Visits ───────────────────────────────────────────────────────────
    if (changes.visits) {
      const col = database.collections.get<Visit>('visits')

      if (changes.visits.updated.length > 0) {
        const ids = changes.visits.updated.map(r => r.id)
        const existing = await col.query(Q.where('id', Q.oneOf(ids))).fetch()
        const existingMap = new Map(existing.map(r => [r.id, r]))

        for (const sr of changes.visits.updated) {
          const rec = existingMap.get(sr.id)
          if (rec) {
            batch.push(rec.prepareUpdate(r => {
              r.status = sr.status as Visit['status']
              r.checkOutAt = ms(sr.checkOutAt)
              r.checkOutLat = sr.checkOutLat
              r.checkOutLng = sr.checkOutLng
              r.notes = sr.notes
              r._raw.updated_at = msRequired(sr.updatedAt)
            }))
          } else {
            batch.push(col.prepareCreate(r => {
              r._raw.id = sr.id
              r.organizationId = organizationId
              r.agentId = agentId
              r.customerId = sr.customerId
              r.status = sr.status as Visit['status']
              r.checkInAt = msRequired(sr.checkInAt)
              r.checkOutAt = ms(sr.checkOutAt)
              r.checkInLat = sr.checkInLat
              r.checkInLng = sr.checkInLng
              r.checkOutLat = sr.checkOutLat
              r.checkOutLng = sr.checkOutLng
              r.notes = sr.notes
              r.tasksCompleted = 0
              r.tasksTotal = 0
              r._raw.created_at = msRequired(sr.checkInAt)
              r._raw.updated_at = msRequired(sr.updatedAt)
            }))
          }
        }
      }

      for (const id of changes.visits.deleted) {
        try {
          const rec = await col.find(id)
          batch.push(rec.prepareDestroyPermanently())
        } catch { /* not found */ }
      }
    }

    // ── Orders ────────────────────────────────────────────────────────────
    if (changes.orders) {
      const col = database.collections.get<Order>('orders')

      if (changes.orders.updated.length > 0) {
        const ids = changes.orders.updated.map(r => r.id)
        const existing = await col.query(Q.where('id', Q.oneOf(ids))).fetch()
        const existingMap = new Map(existing.map(r => [r.id, r]))

        for (const sr of changes.orders.updated) {
          const serverItems = (Array.isArray(sr.items) ? sr.items : []) as OrderItem[]
          const rec = existingMap.get(sr.id)
          if (rec) {
            batch.push(rec.prepareUpdate(r => {
              r.status = sr.status as Order['status']
              r.orderNumber = sr.orderNumber
              r.totalAmount = sr.totalAmount
              r.notes = sr.notes
              r.items = serverItems
              r._raw.updated_at = msRequired(sr.updatedAt)
            }))
          } else {
            batch.push(col.prepareCreate(r => {
              r._raw.id = sr.id
              r.organizationId = organizationId
              r.agentId = agentId
              r.customerId = sr.customerId
              r.visitId = sr.visitId ?? null
              r.orderNumber = sr.orderNumber
              r.status = sr.status as Order['status']
              r.items = serverItems
              r.totalAmount = sr.totalAmount
              r.notes = sr.notes
              r._raw.created_at = msRequired(sr.createdAt)
              r._raw.updated_at = msRequired(sr.updatedAt)
            }))
          }
        }
      }

      for (const id of changes.orders.deleted) {
        try {
          const rec = await col.find(id)
          batch.push(rec.prepareDestroyPermanently())
        } catch { /* not found */ }
      }
    }

    // ── Tasks ─────────────────────────────────────────────────────────────
    if (changes.tasks) {
      const col = database.collections.get<Task>('tasks')

      if (changes.tasks.updated.length > 0) {
        const ids = changes.tasks.updated.map(r => r.id)
        const existing = await col.query(Q.where('id', Q.oneOf(ids))).fetch()
        const existingMap = new Map(existing.map(r => [r.id, r]))

        for (const sr of changes.tasks.updated) {
          const rec = existingMap.get(sr.id)
          if (rec) {
            batch.push(rec.prepareUpdate(r => {
              r.status = sr.status as Task['status']
              r.completedAt = ms(sr.completedAt)
              r._raw.updated_at = msRequired(sr.updatedAt)
            }))
          } else {
            batch.push(col.prepareCreate(r => {
              r._raw.id = sr.id
              r.organizationId = organizationId
              r.agentId = agentId
              r.customerId = sr.customerId
              r.title = sr.title
              r.description = sr.description
              r.status = sr.status as Task['status']
              r.priority = sr.priority as Task['priority']
              r.dueDate = ms(sr.dueDate)
              r.completedAt = ms(sr.completedAt)
              r._raw.created_at = msRequired(sr.updatedAt)
              r._raw.updated_at = msRequired(sr.updatedAt)
            }))
          }
        }
      }

      for (const id of changes.tasks.deleted) {
        try {
          const rec = await col.find(id)
          batch.push(rec.prepareDestroyPermanently())
        } catch { /* not found */ }
      }
    }

    // ── Execute all ops in one SQLite transaction ─────────────────────────
    if (batch.length > 0) {
      await database.batch(batch)
    }
  })
}
