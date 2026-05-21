/**
 * offline-helpers — atomic write + @json setter regression tests (M2-1e)
 *
 * Each helper must:
 *   1. Open exactly one database.write() transaction
 *   2. Create/update the entity AND an OutboxOperation in that same transaction
 *   3. Use the @json property setter for o.data and r.items (not _raw bypass)
 *   4. Outbox op has status='pending', retryCount=0
 */

import { database } from '../../src/db/database'
import {
  createVisitOffline,
  checkOutOffline,
  createOrderOffline,
  updateTaskOffline,
} from '../../src/db/helpers/offline'

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../src/db/database', () => ({
  database: {
    write: jest.fn(async (fn: () => Promise<void>) => fn()),
    batch: jest.fn(),
    collections: { get: jest.fn() },
  },
}))

jest.mock('@nozbe/watermelondb', () => ({
  Q: { where: jest.fn(), oneOf: jest.fn() },
  Model: class Model { _raw: Record<string, unknown> = {} },
}))

const db = database as {
  write: jest.Mock
  batch: jest.Mock
  collections: { get: jest.Mock }
}

// ─── Collection factory ────────────────────────────────────────────────────────

let _createSeq = 0
function makeCollection(findRecord?: Record<string, unknown>) {
  const preparedCreates: Record<string, unknown>[] = []
  return {
    _preparedCreates: preparedCreates,
    find: jest.fn(async () => {
      if (!findRecord) throw new Error('Not found')
      return findRecord
    }),
    /**
     * WatermelonDB's prepareCreate() returns the new record object (with
     * auto-assigned CUID in .id). Mimic that here so callers can read .id.
     */
    prepareCreate: jest.fn((cb: (r: Record<string, unknown>) => void) => {
      const id = `mock-cuid-${++_createSeq}`
      const r: Record<string, unknown> = { id, _raw: { id } }
      cb(r)
      preparedCreates.push(r)
      return r   // ← WDB returns the record object, not a wrapper
    }),
  }
}

beforeEach(() => { _createSeq = 0 })

function makeMutableRecord(id: string) {
  const state: Record<string, unknown> = { id, _raw: { id } }
  return {
    id,
    state,
    prepareUpdate: jest.fn((cb: (r: Record<string, unknown>) => void) => {
      cb(state)
      return { __type: 'update', state }
    }),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
})

// ─── createVisitOffline ───────────────────────────────────────────────────────

describe('createVisitOffline', () => {
  it('executes in exactly one write() transaction', async () => {
    const visitsCol = makeCollection()
    const outboxCol = makeCollection()
    db.collections.get
      .mockReturnValueOnce(visitsCol)
      .mockReturnValueOnce(outboxCol)

    await createVisitOffline({
      organizationId: 'org-1', agentId: 'agent-1',
      customerId: 'cust-1',
    })

    expect(db.write).toHaveBeenCalledTimes(1)
  })

  it('creates both a visit record and an outbox op atomically', async () => {
    const visitsCol = makeCollection()
    const outboxCol = makeCollection()
    db.collections.get
      .mockReturnValueOnce(visitsCol)
      .mockReturnValueOnce(outboxCol)

    await createVisitOffline({
      organizationId: 'org-1', agentId: 'agent-1',
      customerId: 'cust-1',
    })

    expect(visitsCol.prepareCreate).toHaveBeenCalledTimes(1)
    expect(outboxCol.prepareCreate).toHaveBeenCalledTimes(1)
    expect(db.batch).toHaveBeenCalledTimes(1)
  })

  it('outbox op: uses o.data setter (not o._raw.data bypass)', async () => {
    const visitsCol = makeCollection()
    const outboxCol = makeCollection()
    db.collections.get
      .mockReturnValueOnce(visitsCol)
      .mockReturnValueOnce(outboxCol)

    await createVisitOffline({
      organizationId: 'org-1', agentId: 'agent-1',
      customerId: 'cust-7', checkInLat: 40.4, checkInLng: 49.8,
    })

    const op = outboxCol._preparedCreates[0]
    // data must be set via @json setter (plain object, not JSON string)
    expect(typeof op.data).toBe('object')
    expect(op.data).not.toBeNull()
    expect((op.data as Record<string, unknown>).customerId).toBe('cust-7')
    // _raw.data must NOT have been set directly
    expect((op._raw as Record<string, unknown>).data).toBeUndefined()
  })

  it('outbox op has status=pending and retryCount=0', async () => {
    const visitsCol = makeCollection()
    const outboxCol = makeCollection()
    db.collections.get
      .mockReturnValueOnce(visitsCol)
      .mockReturnValueOnce(outboxCol)

    await createVisitOffline({
      organizationId: 'org-1', agentId: 'agent-1', customerId: 'cust-1',
    })

    const op = outboxCol._preparedCreates[0]
    expect(op.status).toBe('pending')
    expect(op.retryCount).toBe(0)
    expect(op.opType).toBe('create')
    expect(op.entity).toBe('visits')
  })

  it('returns the new visit ID as string', async () => {
    const visitsCol = makeCollection()
    const outboxCol = makeCollection()
    db.collections.get
      .mockReturnValueOnce(visitsCol)
      .mockReturnValueOnce(outboxCol)

    const id = await createVisitOffline({
      organizationId: 'org-1', agentId: 'agent-1', customerId: 'cust-1',
    })

    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })
})

// ─── checkOutOffline ──────────────────────────────────────────────────────────

describe('checkOutOffline', () => {
  it('updates existing visit to CHECKED_OUT and creates outbox op', async () => {
    const visit = makeMutableRecord('visit-1')
    const visitsCol = makeCollection(visit as any)
    const outboxCol = makeCollection()
    db.collections.get
      .mockReturnValueOnce(visitsCol)
      .mockReturnValueOnce(outboxCol)

    await checkOutOffline({ visitId: 'visit-1' })

    expect(visit.prepareUpdate).toHaveBeenCalledTimes(1)
    expect(visit.state.status).toBe('CHECKED_OUT')
    expect(outboxCol.prepareCreate).toHaveBeenCalledTimes(1)
  })

  it('outbox op: uses o.data setter (not o._raw.data)', async () => {
    const visit = makeMutableRecord('visit-2')
    const visitsCol = makeCollection(visit as any)
    const outboxCol = makeCollection()
    db.collections.get
      .mockReturnValueOnce(visitsCol)
      .mockReturnValueOnce(outboxCol)

    await checkOutOffline({
      visitId: 'visit-2', checkOutLat: 40.5, checkOutLng: 49.9, duration: 3600,
    })

    const op = outboxCol._preparedCreates[0]
    expect(typeof op.data).toBe('object')
    expect((op.data as Record<string, unknown>).id).toBe('visit-2')
    expect((op.data as Record<string, unknown>).status).toBe('CHECKED_OUT')
    expect((op._raw as Record<string, unknown>).data).toBeUndefined()
  })
})

// ─── createOrderOffline ───────────────────────────────────────────────────────

describe('createOrderOffline', () => {
  const items = [
    { skuId: 'sku-1', name: 'Pepsi 1L', qty: 12, price: 150 },
    { skuId: 'sku-2', name: 'Pepsi 0.5L', qty: 6, price: 80 },
  ]

  it('order record: uses r.items setter (not r._raw.items bypass)', async () => {
    const ordersCol = makeCollection()
    const outboxCol = makeCollection()
    db.collections.get
      .mockReturnValueOnce(ordersCol)
      .mockReturnValueOnce(outboxCol)

    await createOrderOffline({
      organizationId: 'org-1', agentId: 'agent-1',
      customerId: 'cust-1', items,
    })

    const order = ordersCol._preparedCreates[0]
    // Key anti-regression: items set via @json setter
    expect(order.items).toEqual(items)
    expect((order._raw as Record<string, unknown>).items).toBeUndefined()
  })

  it('outbox data: uses o.data setter with server-friendly item shape', async () => {
    const ordersCol = makeCollection()
    const outboxCol = makeCollection()
    db.collections.get
      .mockReturnValueOnce(ordersCol)
      .mockReturnValueOnce(outboxCol)

    await createOrderOffline({
      organizationId: 'org-1', agentId: 'agent-1',
      customerId: 'cust-1', items,
    })

    const op = outboxCol._preparedCreates[0]
    expect(typeof op.data).toBe('object')
    const payload = op.data as Record<string, unknown>
    expect(payload.customerId).toBe('cust-1')
    const opItems = payload.items as Array<Record<string, unknown>>
    expect(opItems[0].quantity).toBe(12)   // qty → quantity mapping
    expect(opItems[0].unitPrice).toBe(150) // price → unitPrice mapping
    expect((op._raw as Record<string, unknown>).data).toBeUndefined()
  })

  it('computes totalAmount from items correctly', async () => {
    const ordersCol = makeCollection()
    const outboxCol = makeCollection()
    db.collections.get
      .mockReturnValueOnce(ordersCol)
      .mockReturnValueOnce(outboxCol)

    await createOrderOffline({
      organizationId: 'org-1', agentId: 'agent-1',
      customerId: 'cust-1', items,
    })

    const order = ordersCol._preparedCreates[0]
    // 12*150 + 6*80 = 1800 + 480 = 2280
    expect(order.totalAmount).toBe(2280)
  })
})

// ─── updateTaskOffline ────────────────────────────────────────────────────────

describe('updateTaskOffline', () => {
  it('updates task status and creates outbox op', async () => {
    const task = makeMutableRecord('task-1')
    const tasksCol = makeCollection(task as any)
    const outboxCol = makeCollection()
    db.collections.get
      .mockReturnValueOnce(tasksCol)
      .mockReturnValueOnce(outboxCol)

    await updateTaskOffline({ taskId: 'task-1', status: 'COMPLETED' })

    expect(task.prepareUpdate).toHaveBeenCalledTimes(1)
    expect(task.state.status).toBe('COMPLETED')
    expect(outboxCol.prepareCreate).toHaveBeenCalledTimes(1)
  })

  it('sets completedAt when transitioning to COMPLETED (if not already set)', async () => {
    const task = makeMutableRecord('task-1')
    ;(task.state as Record<string, unknown>).completedAt = null
    const tasksCol = makeCollection(task as any)
    const outboxCol = makeCollection()
    db.collections.get
      .mockReturnValueOnce(tasksCol)
      .mockReturnValueOnce(outboxCol)

    const before = Date.now()
    await updateTaskOffline({ taskId: 'task-1', status: 'COMPLETED' })
    const after = Date.now()

    const completedAt = task.state.completedAt as number
    expect(completedAt).toBeGreaterThanOrEqual(before)
    expect(completedAt).toBeLessThanOrEqual(after)
  })

  it('does NOT override existing completedAt when completing again', async () => {
    const existingTs = 1_000_000_000_000
    const task = makeMutableRecord('task-1')
    ;(task.state as Record<string, unknown>).completedAt = existingTs
    const tasksCol = makeCollection(task as any)
    const outboxCol = makeCollection()
    db.collections.get
      .mockReturnValueOnce(tasksCol)
      .mockReturnValueOnce(outboxCol)

    await updateTaskOffline({ taskId: 'task-1', status: 'COMPLETED' })

    expect(task.state.completedAt).toBe(existingTs)
  })

  it('outbox data: uses o.data setter (not o._raw.data)', async () => {
    const task = makeMutableRecord('task-2')
    const tasksCol = makeCollection(task as any)
    const outboxCol = makeCollection()
    db.collections.get
      .mockReturnValueOnce(tasksCol)
      .mockReturnValueOnce(outboxCol)

    await updateTaskOffline({ taskId: 'task-2', status: 'SKIPPED', result: 'No contact' })

    const op = outboxCol._preparedCreates[0]
    expect(typeof op.data).toBe('object')
    const d = op.data as Record<string, unknown>
    expect(d.id).toBe('task-2')
    expect(d.status).toBe('SKIPPED')
    expect(d.result).toBe('No contact')
    expect((op._raw as Record<string, unknown>).data).toBeUndefined()
  })
})
