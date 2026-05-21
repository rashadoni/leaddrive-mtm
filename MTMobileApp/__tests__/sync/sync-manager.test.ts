/**
 * SyncManager — chaos + state-machine tests (M2-1e)
 *
 * Scenarios covered:
 *   - Concurrent sync guard: second triggerSync() returns false immediately
 *   - Status transitions: idle → syncing → idle (success), → error (failure)
 *   - Push result handling: ok/conflict/error/no-result/network-fail
 *   - ANTI-REGRESSION: conflict handler uses r.data setter (not r._raw.data)
 *   - ANTI-REGRESSION: push payload reads op.data (not _raw.data manual parse)
 *   - Retry count increments on server error; fails after MAX_RETRIES (5)
 *   - Network error reverts ops back to 'pending'
 *   - Status listener: fires immediately on subscribe, fires on each state change
 *   - Empty outbox: _push returns early without calling api.request
 *   - startAutoSync: idempotent (calling twice does not create two timers)
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) => {
      if (key === '@mtm_agent') {
        return Promise.resolve(JSON.stringify({ id: 'agent-1', organizationId: 'org-1' }))
      }
      if (key === '@mtm_client_id') {
        return Promise.resolve('test-client-id')
      }
      return Promise.resolve(null)
    }),
    setItem: jest.fn(() => Promise.resolve()),
  },
}))

jest.mock('../../src/db/database', () => ({
  database: {
    write: jest.fn(async (fn: () => Promise<void>) => fn()),
    batch: jest.fn(),
    collections: { get: jest.fn() },
  },
}))

jest.mock('../../src/db/helpers/applyPull', () => ({
  applyPull: jest.fn(async () => {}),
}))

jest.mock('../../src/services/api', () => ({
  api: { request: jest.fn() },
}))

jest.mock('@nozbe/watermelondb', () => ({
  Q: {
    where: jest.fn((_col: string, _val: unknown) => ({ __q: 'where' })),
    oneOf: jest.fn((ids: string[]) => ({ __q: 'oneOf', ids })),
    lt: jest.fn((v: number) => ({ __q: 'lt', v })),
  },
  Model: class Model { _raw: Record<string, unknown> = {} },
}))

import { SyncManager } from '../../src/services/sync-manager'
import { database } from '../../src/db/database'
import { api } from '../../src/services/api'
import AsyncStorage from '@react-native-async-storage/async-storage'

const db = database as {
  write: jest.Mock
  batch: jest.Mock
  collections: { get: jest.Mock }
}
const mockApi = api as { request: jest.Mock }
const mockStorage = AsyncStorage as { getItem: jest.Mock; setItem: jest.Mock }

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Make a mock outbox op record.
 *
 * _raw.data is intentionally kept as the original JSON string so the
 * conflict anti-regression test can assert that the fixed code does NOT
 * overwrite _raw.data with a merged JSON string.
 */
function makePendingOp(overrides: Partial<{
  id: string; operationId: string; opType: string; entity: string;
  retryCount: number; status: string;
  data: Record<string, unknown>;
}> = {}) {
  const initialData = overrides.data ?? { id: 'visit-1', status: 'CHECKED_OUT' }
  const initialDataStr = JSON.stringify(initialData)

  const state: Record<string, unknown> = {
    id: overrides.id ?? 'op-1',
    operationId: overrides.operationId ?? 'uuid-op-1',
    opType: overrides.opType ?? 'create',
    entity: overrides.entity ?? 'visits',
    data: { ...initialData },   // @json decoded view — what op.data returns
    clientTimestamp: Date.now(),
    status: overrides.status ?? 'pending',
    retryCount: overrides.retryCount ?? 0,
    lastError: null,
    syncedAt: null,
    _raw: { data: initialDataStr },   // raw JSON string (the @json decorator storage)
  }

  return {
    ...state,
    state,
    prepareUpdate: jest.fn((cb: (r: Record<string, unknown>) => void) => {
      cb(state)
      return { __type: 'update', state }
    }),
    // needed by _purgeOldSynced if it accidentally fetches these ops
    prepareDestroyPermanently: jest.fn(() => ({ __type: 'destroy', id: state.id })),
  }
}

/**
 * Build a mock outbox collection.
 *
 * The first query().fetch() returns pendingOps (for _push).
 * All subsequent calls return empty results (for _purgeOldSynced + _refreshCounts).
 * This mirrors the real call order inside _syncCycle().
 */
function makeOutboxCollection(pendingOps: ReturnType<typeof makePendingOp>[]) {
  const emptyResult = {
    fetch: jest.fn(async () => []),
    fetchCount: jest.fn(async () => 0),
  }
  return {
    query: jest.fn()
      .mockReturnValueOnce({
        fetch: jest.fn(async () => pendingOps),
        fetchCount: jest.fn(async () => pendingOps.length),
      })
      .mockReturnValue(emptyResult),
  }
}

function setupSyncMocks(pendingOps: ReturnType<typeof makePendingOp>[] = []) {
  const outboxCol = makeOutboxCollection(pendingOps)
  db.collections.get.mockReturnValue(outboxCol)
  return outboxCol
}

beforeEach(() => {
  jest.clearAllMocks()
  // Default: pull succeeds with empty changes
  mockApi.request.mockResolvedValue({
    success: true,
    timestamp: '2026-05-21T10:00:00.000Z',
    changes: {},
  })
  mockStorage.getItem.mockImplementation((key: string) => {
    if (key === '@mtm_agent') {
      return Promise.resolve(JSON.stringify({ id: 'agent-1', organizationId: 'org-1' }))
    }
    if (key === '@mtm_client_id') return Promise.resolve('test-client-id')
    return Promise.resolve(null)
  })
})

// ─── Concurrent guard ──────────────────────────────────────────────────────────

describe('concurrent sync guard', () => {
  it('triggerSync() returns false when already syncing', async () => {
    const sm = new SyncManager()
    setupSyncMocks()

    let resolveSync!: () => void
    jest.spyOn(sm as any, '_syncCycle').mockImplementation(
      () => new Promise<void>(res => { resolveSync = res }),
    )

    const first = sm.triggerSync()         // starts, hangs
    const second = await sm.triggerSync()  // must return false immediately

    expect(second).toBe(false)

    resolveSync()
    await first
  })

  it('triggerSync() returns true when no sync is in progress', async () => {
    const sm = new SyncManager()
    setupSyncMocks()

    const result = await sm.triggerSync()
    expect(result).toBe(true)
  })
})

// ─── Status transitions ────────────────────────────────────────────────────────

describe('status transitions', () => {
  it('idle → syncing → idle on success', async () => {
    const sm = new SyncManager()
    setupSyncMocks()

    const statuses: string[] = []
    sm.onStatusChange(s => statuses.push(s.status))
    await sm.triggerSync()

    expect(statuses).toContain('syncing')
    expect(statuses[statuses.length - 1]).toBe('idle')
  })

  it('idle → syncing → error when pull fails', async () => {
    const sm = new SyncManager()
    setupSyncMocks()
    mockApi.request.mockRejectedValueOnce(new Error('Network unreachable'))

    const statuses: string[] = []
    sm.onStatusChange(s => statuses.push(s.status))
    await sm.triggerSync()

    expect(statuses).toContain('syncing')
    expect(statuses[statuses.length - 1]).toBe('error')
  })

  it('lastError is populated on failure', async () => {
    const sm = new SyncManager()
    setupSyncMocks()
    mockApi.request.mockRejectedValueOnce(new Error('Aviation mode'))

    await sm.triggerSync()
    expect(sm.getState().lastError).toBe('Aviation mode')
  })

  it('lastError clears on subsequent success', async () => {
    const sm = new SyncManager()
    setupSyncMocks()

    mockApi.request.mockRejectedValueOnce(new Error('Temp error'))
    await sm.triggerSync()
    expect(sm.getState().lastError).toBeTruthy()

    setupSyncMocks()  // reset mocks for second sync
    mockApi.request.mockResolvedValueOnce({
      success: true, timestamp: '2026-05-21T11:00:00.000Z', changes: {},
    })
    await sm.triggerSync()
    expect(sm.getState().lastError).toBeNull()
  })
})

// ─── Status listeners ─────────────────────────────────────────────────────────

describe('status listeners', () => {
  it('fires immediately with current state on subscribe', () => {
    const sm = new SyncManager()
    const received: string[] = []
    sm.onStatusChange(s => received.push(s.status))
    expect(received).toEqual(['idle'])
  })

  it('unsubscribe stops future events', async () => {
    const sm = new SyncManager()
    setupSyncMocks()

    const received: string[] = []
    const unsub = sm.onStatusChange(s => received.push(s.status))
    const countBefore = received.length

    unsub()
    await sm.triggerSync()

    expect(received.length).toBe(countBefore)
  })
})

// ─── Push: ok result ──────────────────────────────────────────────────────────

describe('push — ok result', () => {
  it('marks op as synced with numeric syncedAt', async () => {
    const op = makePendingOp()
    setupSyncMocks([op])

    mockApi.request.mockImplementation((url: string) => {
      if (url.includes('/sync/pull')) {
        return Promise.resolve({ success: true, timestamp: '2026-05-21T10:00:00Z', changes: {} })
      }
      return Promise.resolve({
        results: [{ operationId: 'uuid-op-1', status: 'ok' }],
      })
    })

    await new SyncManager().triggerSync()

    expect(op.state.status).toBe('synced')
    expect(typeof op.state.syncedAt).toBe('number')
  })
})

// ─── Push: conflict (anti-regression) ────────────────────────────────────────

describe('push — conflict result (anti-regression)', () => {
  it('marks failed and merges serverData + _conflict via r.data setter', async () => {
    const op = makePendingOp()
    setupSyncMocks([op])

    const serverData = { id: 'visit-1', status: 'CHECKED_IN', reason: 'Server override' }
    mockApi.request.mockImplementation((url: string) => {
      if (url.includes('/sync/pull')) {
        return Promise.resolve({ success: true, timestamp: '2026-05-21T10:00:00Z', changes: {} })
      }
      return Promise.resolve({
        results: [{
          operationId: 'uuid-op-1',
          status: 'conflict',
          error: 'Conflict with server data',
          serverData,
        }],
      })
    })

    await new SyncManager().triggerSync()

    // Status
    expect(op.state.status).toBe('failed')

    // ANTI-REGRESSION: r.data must be a plain object with merged fields
    // (set via @json setter `r.data = { ...r.data, ... }`)
    const mergedData = op.state.data as Record<string, unknown>
    expect(typeof mergedData).toBe('object')
    expect(mergedData._serverData).toEqual(serverData)
    expect(mergedData._conflict).toBe(true)
    // Original data keys preserved
    expect(mergedData.id).toBe('visit-1')

    // ANTI-REGRESSION: _raw.data must NOT have been overwritten with a
    // merged JSON string (that was the bug — direct _raw bypass that skips _setRaw).
    // With the fix, _raw.data stays as the original JSON from before the update.
    const rawData = (op.state._raw as Record<string, unknown>).data as string
    expect(rawData).not.toContain('_serverData')
    expect(rawData).not.toContain('_conflict')
  })
})

// ─── Push: server error + retry ───────────────────────────────────────────────

describe('push — server error with retry', () => {
  it('increments retryCount, keeps pending when below MAX_RETRIES (5)', async () => {
    const op = makePendingOp({ retryCount: 2 })
    setupSyncMocks([op])

    mockApi.request.mockImplementation((url: string) => {
      if (url.includes('/sync/pull')) {
        return Promise.resolve({ success: true, timestamp: '2026-05-21T10:00:00Z', changes: {} })
      }
      return Promise.resolve({
        results: [{ operationId: 'uuid-op-1', status: 'error', error: 'DB timeout' }],
      })
    })

    await new SyncManager().triggerSync()

    expect(op.state.retryCount).toBe(3)
    expect(op.state.status).toBe('pending')
    expect(op.state.lastError).toBe('DB timeout')
  })

  it('marks failed when retryCount reaches MAX_RETRIES (5)', async () => {
    const op = makePendingOp({ retryCount: 4 })  // 4 + 1 = 5 = MAX_RETRIES
    setupSyncMocks([op])

    mockApi.request.mockImplementation((url: string) => {
      if (url.includes('/sync/pull')) {
        return Promise.resolve({ success: true, timestamp: '2026-05-21T10:00:00Z', changes: {} })
      }
      return Promise.resolve({
        results: [{ operationId: 'uuid-op-1', status: 'error', error: 'Persistent' }],
      })
    })

    await new SyncManager().triggerSync()

    expect(op.state.retryCount).toBe(5)
    expect(op.state.status).toBe('failed')
  })
})

// ─── Push: no result for op ───────────────────────────────────────────────────

describe('push — no result from server', () => {
  it('treats missing result as error and increments retryCount', async () => {
    const op = makePendingOp({ retryCount: 0 })
    setupSyncMocks([op])

    mockApi.request.mockImplementation((url: string) => {
      if (url.includes('/sync/pull')) {
        return Promise.resolve({ success: true, timestamp: '2026-05-21T10:00:00Z', changes: {} })
      }
      return Promise.resolve({ results: [] })  // op not acknowledged
    })

    await new SyncManager().triggerSync()

    expect(op.state.retryCount).toBe(1)
    expect(op.state.status).toBe('pending')
    expect(op.state.lastError).toBe('No result from server')
  })
})

// ─── Push: network error (aviation mode) ─────────────────────────────────────

describe('push — network error', () => {
  it('reverts all ops back to pending and aborts the cycle', async () => {
    const op = makePendingOp()
    setupSyncMocks([op])

    mockApi.request.mockImplementation((url: string) => {
      if (url.includes('/sync/pull')) {
        return Promise.resolve({ success: true, timestamp: '2026-05-21T10:00:00Z', changes: {} })
      }
      return Promise.reject(new Error('Network request failed'))
    })

    const result = await new SyncManager().triggerSync()

    // Cycle aborted → returns false
    expect(result).toBe(false)
    // Op must NOT be stuck as 'syncing'
    expect(op.state.status).toBe('pending')
  })
})

// ─── Push: empty outbox ───────────────────────────────────────────────────────

describe('push — empty outbox', () => {
  it('skips api.request for push when no pending ops', async () => {
    setupSyncMocks([])

    await new SyncManager().triggerSync()

    const pushCalls = mockApi.request.mock.calls.filter(
      (c: string[][]) => (c[0] as string).includes('/sync/push'),
    )
    expect(pushCalls.length).toBe(0)
  })
})

// ─── Auto-sync ────────────────────────────────────────────────────────────────

describe('startAutoSync', () => {
  it('is idempotent — calling twice does not create a second timer', () => {
    jest.useFakeTimers()
    const sm = new SyncManager()
    setupSyncMocks()

    sm.startAutoSync()
    const ref1 = (sm as any)._autoSyncTimer

    sm.startAutoSync()
    const ref2 = (sm as any)._autoSyncTimer

    expect(ref1).toBe(ref2)
    sm.stopAutoSync()
    jest.useRealTimers()
  })

  it('stopAutoSync clears the timer', () => {
    jest.useFakeTimers()
    const sm = new SyncManager()
    setupSyncMocks()

    sm.startAutoSync()
    sm.stopAutoSync()

    expect((sm as any)._autoSyncTimer).toBeNull()
    jest.useRealTimers()
  })
})

// ─── Push payload: reads op.data not _raw.data (anti-regression) ─────────────

describe('push payload anti-regression: op.data not _raw.data', () => {
  it('operations[0].data in POST body is a plain object (not JSON-string)', async () => {
    const opData = { id: 'visit-99', status: 'CHECKED_OUT', checkOutAt: '2026-05-21T12:00:00Z' }
    const op = makePendingOp({ data: opData, operationId: 'uuid-push-test' })
    setupSyncMocks([op])

    let capturedPayload: Record<string, unknown> | null = null
    mockApi.request.mockImplementation((url: string, opts?: { body?: string }) => {
      if (url.includes('/sync/pull')) {
        return Promise.resolve({ success: true, timestamp: '2026-05-21T10:00:00Z', changes: {} })
      }
      if (opts?.body) capturedPayload = JSON.parse(opts.body)
      return Promise.resolve({
        results: [{ operationId: 'uuid-push-test', status: 'ok' }],
      })
    })

    await new SyncManager().triggerSync()

    expect(capturedPayload).not.toBeNull()
    const ops = capturedPayload!.operations as Array<Record<string, unknown>>
    expect(ops.length).toBeGreaterThan(0)
    // data must be the deserialized object (not a string)
    expect(typeof ops[0].data).toBe('object')
    expect(ops[0].data).toEqual(opData)
  })
})
