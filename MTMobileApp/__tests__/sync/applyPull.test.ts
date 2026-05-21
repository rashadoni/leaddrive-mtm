/**
 * applyPull — chaos/regression tests (M2-1e)
 *
 * Key invariants verified:
 *   - Upsert logic: existing record → prepareUpdate; unknown id → prepareCreate
 *   - Delete path: ids in deleted[] → prepareDestroyPermanently
 *   - ANTI-REGRESSION: orders.items uses @json setter (r.items = []) not r._raw.items
 *   - Route points replace-all: existing points destroyed + new recreated per route
 *   - All ops executed in a single database.write() + database.batch() call
 *   - Empty changes object → write is called but batch is skipped (0 ops)
 */

import { database } from '../../src/db/database'
import { applyPull } from '../../src/db/helpers/applyPull'
import type { SyncPullChanges } from '../../src/db/helpers/applyPull'

// ─── Database mock ────────────────────────────────────────────────────────────

jest.mock('../../src/db/database', () => ({
  database: {
    write: jest.fn(async (fn: () => Promise<void>) => fn()),
    batch: jest.fn(),
    collections: { get: jest.fn() },
  },
}))

jest.mock('@nozbe/watermelondb', () => ({
  Q: {
    where: jest.fn((_col: string, val: unknown) => ({ __q: 'where', val })),
    oneOf: jest.fn((ids: string[]) => ({ __q: 'oneOf', ids })),
    lt: jest.fn((v: number) => ({ __q: 'lt', v })),
  },
  Model: class Model { _raw: Record<string, unknown> = {} },
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Create a mock WDB record whose prepareUpdate captures the mutated state. */
function makeRecord(id: string, initial: Record<string, unknown> = {}) {
  const state: Record<string, unknown> = { _raw: { id }, ...initial }
  return {
    id,
    _raw: state._raw as Record<string, unknown>,
    state,   // exposed so tests can inspect post-update values
    prepareUpdate: jest.fn((cb: (r: Record<string, unknown>) => void) => {
      cb(state)
      return { __type: 'update', id, state }
    }),
    prepareDestroyPermanently: jest.fn(() => ({ __type: 'destroy', id })),
  }
}

/** Create a mock collection backed by a list of records. */
function makeCollection(records: ReturnType<typeof makeRecord>[] = []) {
  const preparedCreates: Record<string, unknown>[] = []
  return {
    _preparedCreates: preparedCreates,
    query: jest.fn(() => ({
      fetch: jest.fn(async () => records),
      fetchCount: jest.fn(async () => records.length),
    })),
    find: jest.fn(async (id: string) => {
      const r = records.find(r => r.id === id)
      if (!r) throw new Error(`Not found: ${id}`)
      return r
    }),
    prepareCreate: jest.fn((cb: (r: Record<string, unknown>) => void) => {
      const r: Record<string, unknown> = { _raw: { id: undefined } }
      cb(r)
      preparedCreates.push(r)
      return { __type: 'create', r }
    }),
  }
}

const ctx = { organizationId: 'org-1', agentId: 'agent-1' }

const db = database as {
  write: jest.Mock
  batch: jest.Mock
  collections: { get: jest.Mock }
}

beforeEach(() => {
  jest.clearAllMocks()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('applyPull — customers', () => {
  it('updates existing customer via prepareUpdate', async () => {
    const existing = makeRecord('cust-1')
    const col = makeCollection([existing])
    db.collections.get.mockReturnValue(col)

    const changes: SyncPullChanges = {
      customers: {
        updated: [{
          id: 'cust-1', name: 'Mars AZ LLC', code: 'M001',
          address: 'Baku', latitude: 40.4, longitude: 49.8,
          category: 'DISTRIBUTOR', phone: '+994501234567',
          updatedAt: '2026-05-21T10:00:00Z',
        }],
        deleted: [],
      },
    }

    await applyPull(changes, ctx)

    expect(existing.prepareUpdate).toHaveBeenCalledTimes(1)
    expect(existing.state.name).toBe('Mars AZ LLC')
    expect(existing.state.phone).toBe('+994501234567')
    expect(db.batch).toHaveBeenCalledTimes(1)
  })

  it('creates new customer via prepareCreate when not found locally', async () => {
    const col = makeCollection([])  // no existing records
    db.collections.get.mockReturnValue(col)

    const changes: SyncPullChanges = {
      customers: {
        updated: [{
          id: 'cust-new', name: 'New Distributor', code: null,
          address: null, latitude: null, longitude: null,
          category: 'DISTRIBUTOR', phone: null,
          updatedAt: '2026-05-21T10:00:00Z',
        }],
        deleted: [],
      },
    }

    await applyPull(changes, ctx)

    expect(col.prepareCreate).toHaveBeenCalledTimes(1)
    const created = col._preparedCreates[0]
    expect((created._raw as Record<string, unknown>).id).toBe('cust-new')
    expect(created.organizationId).toBe('org-1')
  })

  it('destroys deleted customers permanently', async () => {
    const rec = makeRecord('cust-del')
    const col = makeCollection([rec])
    db.collections.get.mockReturnValue(col)

    const changes: SyncPullChanges = {
      customers: {
        updated: [],
        deleted: ['cust-del'],
      },
    }

    await applyPull(changes, ctx)

    expect(rec.prepareDestroyPermanently).toHaveBeenCalledTimes(1)
    expect(db.batch).toHaveBeenCalledTimes(1)
  })

  it('silently skips delete for records not found locally', async () => {
    const col = makeCollection([])
    db.collections.get.mockReturnValue(col)

    const changes: SyncPullChanges = {
      customers: { updated: [], deleted: ['ghost-id'] },
    }

    // Should not throw
    await expect(applyPull(changes, ctx)).resolves.toBeUndefined()
  })
})

describe('applyPull — orders (anti-regression: @json items setter)', () => {
  const serverOrder = {
    id: 'order-1', orderNumber: 'ORD-001', customerId: 'cust-1',
    visitId: null, status: 'CONFIRMED', totalAmount: 1500,
    notes: 'Urgent',
    items: [
      { skuId: 'sku-1', name: 'Pepsi 1L', qty: 10, price: 150 },
      { skuId: 'sku-2', name: 'Pepsi 0.5L', qty: 5, price: 0 },
    ],
    createdAt: '2026-05-20T08:00:00Z',
    updatedAt: '2026-05-21T10:00:00Z',
  }

  it('UPDATE path: uses r.items = items setter, NOT r._raw.items', async () => {
    const rec = makeRecord('order-1')
    const col = makeCollection([rec])
    db.collections.get.mockReturnValue(col)

    await applyPull({ orders: { updated: [serverOrder], deleted: [] } }, ctx)

    expect(rec.prepareUpdate).toHaveBeenCalledTimes(1)
    // Key assertion: items was set via the @json property setter
    expect(rec.state.items).toEqual(serverOrder.items)
    // _raw.items must NOT have been directly set (that's the bug we fixed)
    expect((rec.state._raw as Record<string, unknown>).items).toBeUndefined()
  })

  it('CREATE path: uses r.items = items setter for new records', async () => {
    const col = makeCollection([])  // no existing order
    db.collections.get.mockReturnValue(col)

    await applyPull({ orders: { updated: [serverOrder], deleted: [] } }, ctx)

    const created = col._preparedCreates[0]
    expect(created.items).toEqual(serverOrder.items)
    // _raw.items must NOT have been set directly
    expect((created._raw as Record<string, unknown>).items).toBeUndefined()
  })

  it('handles non-array items from server gracefully (empty array fallback)', async () => {
    const rec = makeRecord('order-bad')
    const col = makeCollection([rec])
    db.collections.get.mockReturnValue(col)

    const badOrder = { ...serverOrder, id: 'order-bad', items: null }
    await applyPull({ orders: { updated: [badOrder], deleted: [] } }, ctx)

    expect(rec.state.items).toEqual([])
  })
})

describe('applyPull — routes + route_points (replace-all strategy)', () => {
  it('destroys all existing points and recreates from server data', async () => {
    const routeRec = makeRecord('route-1')
    const existingPoint = makeRecord('pt-old-1')

    const routesCol = makeCollection([routeRec])
    const pointsCol = makeCollection([existingPoint])

    db.collections.get.mockImplementation((table: string) => {
      if (table === 'routes') return routesCol
      if (table === 'route_points') return pointsCol
      return makeCollection([])
    })

    const changes: SyncPullChanges = {
      routes: {
        updated: [{
          id: 'route-1', organizationId: 'org-1', agentId: 'agent-1',
          date: '2026-05-21', name: 'Route A', status: 'ACTIVE',
          totalPoints: 2, visitedPoints: 0,
          startedAt: null, completedAt: null, notes: null,
          createdAt: '2026-05-20T06:00:00Z',
          updatedAt: '2026-05-21T06:00:00Z',
          points: [
            { id: 'pt-new-1', customerId: 'cust-1', orderIndex: 0, status: 'PENDING', plannedTime: null, updatedAt: '2026-05-21T06:00:00Z' },
            { id: 'pt-new-2', customerId: 'cust-2', orderIndex: 1, status: 'PENDING', plannedTime: null, updatedAt: '2026-05-21T06:00:00Z' },
          ],
        }],
        deleted: [],
      },
    }

    await applyPull(changes, ctx)

    // Existing point destroyed
    expect(existingPoint.prepareDestroyPermanently).toHaveBeenCalledTimes(1)
    // Two new points created
    expect(pointsCol.prepareCreate).toHaveBeenCalledTimes(2)
    expect(pointsCol._preparedCreates[0].customerId).toBe('cust-1')
    expect(pointsCol._preparedCreates[1].customerId).toBe('cust-2')
  })

  it('deleting a route also destroys its child points', async () => {
    const routeRec = makeRecord('route-del')
    const childPoint = makeRecord('pt-child')

    const routesCol = makeCollection([routeRec])
    const pointsCol = makeCollection([childPoint])

    db.collections.get.mockImplementation((table: string) => {
      if (table === 'routes') return routesCol
      if (table === 'route_points') return pointsCol
      return makeCollection([])
    })

    await applyPull({
      routes: { updated: [], deleted: ['route-del'] },
    }, ctx)

    expect(routeRec.prepareDestroyPermanently).toHaveBeenCalledTimes(1)
    expect(childPoint.prepareDestroyPermanently).toHaveBeenCalledTimes(1)
  })
})

describe('applyPull — transaction integrity', () => {
  it('all entity ops land in a single database.write() call', async () => {
    const custCol = makeCollection([])
    db.collections.get.mockReturnValue(custCol)

    await applyPull({
      customers: {
        updated: [{ id: 'c1', name: 'A', code: null, address: null,
          latitude: null, longitude: null, category: 'RETAIL',
          phone: null, updatedAt: '2026-05-21T10:00:00Z' }],
        deleted: [],
      },
    }, ctx)

    // Exactly one write transaction
    expect(db.write).toHaveBeenCalledTimes(1)
  })

  it('skips database.batch() when changes object has no entity keys', async () => {
    const col = makeCollection([])
    db.collections.get.mockReturnValue(col)

    await applyPull({}, ctx)

    // write() is always called, but batch() should be skipped (empty batch)
    expect(db.write).toHaveBeenCalledTimes(1)
    expect(db.batch).not.toHaveBeenCalled()
  })
})
