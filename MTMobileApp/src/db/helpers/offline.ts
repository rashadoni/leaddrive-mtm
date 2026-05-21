/**
 * Offline write helpers — create/update entities atomically with an outbox operation.
 *
 * Each function:
 * 1. Opens a single database.write() transaction
 * 2. Creates/updates the entity in WatermelonDB (client-generated ID)
 * 3. Appends an OutboxOperation record (status='pending')
 *
 * The SyncManager (M2-1c) will pick up all pending OutboxOperations and push them to the server.
 *
 * ID generation: uses crypto.randomUUID() (available in Hermes/RN 0.70+) for operationIds,
 * and lets WatermelonDB auto-generate CUIDs for entity IDs.
 */

import { database } from '../database'
import type { OrderItem } from '../models/Order'
import type { Visit } from '../models/Visit'
import type { Task } from '../models/Task'
import type { Order } from '../models/Order'
import type { OutboxOperation } from '../models/OutboxOperation'

// ─── ID helpers ──────────────────────────────────────────────────────────────

/**
 * Generate a UUIDv4 idempotency key for outbox operations.
 * Hermes supports crypto.randomUUID() from RN 0.70+.
 */
function generateOperationId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback: timestamp + random (not spec-compliant UUID, but unique enough)
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

// ─── Visit helpers ────────────────────────────────────────────────────────────

export interface CreateVisitInput {
  organizationId: string
  agentId: string
  customerId: string
  checkInAt?: number          // epoch ms; defaults to now
  checkInLat?: number | null
  checkInLng?: number | null
  notes?: string | null
}

/**
 * Create a visit offline. Returns the new visit's WDB ID (= future server ID).
 */
export async function createVisitOffline(input: CreateVisitInput): Promise<string> {
  const visitsCol = database.collections.get<Visit>('visits')
  const outboxCol = database.collections.get<OutboxOperation>('outbox_operations')

  let visitId!: string

  await database.write(async () => {
    const now = Date.now()
    const checkInAt = input.checkInAt ?? now
    const operationId = generateOperationId()

    const visit = visitsCol.prepareCreate(r => {
      // WDB auto-generates the CUID for r.id
      r.organizationId = input.organizationId
      r.agentId = input.agentId
      r.customerId = input.customerId
      r.status = 'CHECKED_IN'
      r.checkInAt = checkInAt
      r.checkInLat = input.checkInLat ?? null
      r.checkInLng = input.checkInLng ?? null
      r.notes = input.notes ?? null
      r.tasksCompleted = 0
      r.tasksTotal = 0
      r._raw.created_at = now
      r._raw.updated_at = now
    })

    const outbox = outboxCol.prepareCreate(o => {
      o.operationId = operationId
      o.opType = 'create'
      o.entity = 'visits'
      o.data = {
        id: visit.id,
        customerId: input.customerId,
        checkInAt: new Date(checkInAt).toISOString(),
        checkInLat: input.checkInLat ?? null,
        checkInLng: input.checkInLng ?? null,
        notes: input.notes ?? null,
        status: 'CHECKED_IN',
      }
      o.clientTimestamp = now
      o.status = 'pending'
      o.retryCount = 0
      o._raw.created_at = now
    })

    await database.batch(visit, outbox)
    visitId = visit.id
  })

  return visitId
}

export interface CheckOutInput {
  visitId: string
  checkOutAt?: number
  checkOutLat?: number | null
  checkOutLng?: number | null
  notes?: string | null
  duration?: number | null
}

/**
 * Check out of a visit offline. Marks visit CHECKED_OUT and queues push.
 */
export async function checkOutOffline(input: CheckOutInput): Promise<void> {
  const visitsCol = database.collections.get<Visit>('visits')
  const outboxCol = database.collections.get<OutboxOperation>('outbox_operations')

  await database.write(async () => {
    const now = Date.now()
    const checkOutAt = input.checkOutAt ?? now
    const operationId = generateOperationId()

    const visit = await visitsCol.find(input.visitId)
    const updatedVisit = visit.prepareUpdate(r => {
      r.status = 'CHECKED_OUT'
      r.checkOutAt = checkOutAt
      r.checkOutLat = input.checkOutLat ?? null
      r.checkOutLng = input.checkOutLng ?? null
      r.notes = input.notes ?? r.notes
      r.duration = input.duration ?? null
      r._raw.updated_at = now
    })

    const outbox = outboxCol.prepareCreate(o => {
      o.operationId = operationId
      o.opType = 'update'
      o.entity = 'visits'
      o.data = {
        id: input.visitId,
        status: 'CHECKED_OUT',
        checkOutAt: new Date(checkOutAt).toISOString(),
        checkOutLat: input.checkOutLat ?? null,
        checkOutLng: input.checkOutLng ?? null,
        notes: input.notes ?? null,
        duration: input.duration ?? null,
      }
      o.clientTimestamp = now
      o.status = 'pending'
      o.retryCount = 0
      o._raw.created_at = now
    })

    await database.batch(updatedVisit, outbox)
  })
}

// ─── Order helpers ────────────────────────────────────────────────────────────

export interface CreateOrderInput {
  organizationId: string
  agentId: string
  customerId: string
  visitId?: string | null
  items: OrderItem[]
  notes?: string | null
}

/**
 * Create an order offline. Returns new order's WDB ID.
 */
export async function createOrderOffline(input: CreateOrderInput): Promise<string> {
  const ordersCol = database.collections.get<Order>('orders')
  const outboxCol = database.collections.get<OutboxOperation>('outbox_operations')

  let orderId!: string

  await database.write(async () => {
    const now = Date.now()
    const operationId = generateOperationId()
    const totalAmount = input.items.reduce((s, it) => s + it.qty * it.price, 0)

    const order = ordersCol.prepareCreate(r => {
      r.organizationId = input.organizationId
      r.agentId = input.agentId
      r.customerId = input.customerId
      r.visitId = input.visitId ?? null
      r.status = 'DRAFT'
      r.items = input.items
      r.totalAmount = totalAmount
      r.notes = input.notes ?? null
      r._raw.created_at = now
      r._raw.updated_at = now
    })

    const outbox = outboxCol.prepareCreate(o => {
      o.operationId = operationId
      o.opType = 'create'
      o.entity = 'orders'
      o.data = {
        id: order.id,
        customerId: input.customerId,
        visitId: input.visitId ?? null,
        items: input.items.map(it => ({
          skuId: it.skuId ?? null,
          name: it.name,
          quantity: it.qty,
          unitPrice: it.price,
        })),
        notes: input.notes ?? null,
      }
      o.clientTimestamp = now
      o.status = 'pending'
      o.retryCount = 0
      o._raw.created_at = now
    })

    await database.batch(order, outbox)
    orderId = order.id
  })

  return orderId
}

// ─── Task helpers ─────────────────────────────────────────────────────────────

export interface UpdateTaskInput {
  taskId: string
  status: Task['status']
  result?: string | null
}

/**
 * Update a task offline (typically status → COMPLETED/SKIPPED).
 */
export async function updateTaskOffline(input: UpdateTaskInput): Promise<void> {
  const tasksCol = database.collections.get<Task>('tasks')
  const outboxCol = database.collections.get<OutboxOperation>('outbox_operations')

  await database.write(async () => {
    const now = Date.now()
    const operationId = generateOperationId()

    const task = await tasksCol.find(input.taskId)
    const updatedTask = task.prepareUpdate(r => {
      r.status = input.status
      if (input.status === 'COMPLETED' && !r.completedAt) {
        r.completedAt = now
      }
      if (input.result !== undefined) r.result = input.result ?? null
      r._raw.updated_at = now
    })

    const outbox = outboxCol.prepareCreate(o => {
      o.operationId = operationId
      o.opType = 'update'
      o.entity = 'tasks'
      o.data = {
        id: input.taskId,
        status: input.status,
        ...(input.result !== undefined ? { result: input.result ?? null } : {}),
      }
      o.clientTimestamp = now
      o.status = 'pending'
      o.retryCount = 0
      o._raw.created_at = now
    })

    await database.batch(updatedTask, outbox)
  })
}
