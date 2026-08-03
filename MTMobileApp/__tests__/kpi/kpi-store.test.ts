/**
 * G4 — KPI store for the Dashboard screen.
 *
 * The store used to aggregate visit, task and photo counts client-side from
 * the list endpoints. Those lists carry no date filter, so a widget captioned
 * "today" was really counting the first page of all-time rows. The store now
 * reads GET /mobile/kpi, where the server owns the formulas and the day
 * period, so a widget and the web report cannot disagree.
 *
 * Covered:
 *   fetchKpi translates the UI period ('today') into the server one ('day')
 *   fetchKpi maps plan fulfilment, tasks, coverage and GPS confirmation
 *   fetchKpi sets loading=true during fetch, false after
 *   fetchKpi sets error on API failure
 *   setPeriod updates period and triggers refetch
 *   identity isolation: no scope → no request; late responses are dropped
 */

jest.mock('../../src/services/api', () => ({
  api: { getKpi: jest.fn() },
}))

import { api } from '../../src/services/api'
import { kpiScopeKey, useKpiStore } from '../../src/store/kpi'

const mockGetKpi = api.getKpi as jest.Mock

/** Shape mirrors GET /mobile/kpi (protocolVersion 2). */
const SAMPLE_KPI = {
  success: true,
  data: {
    protocolVersion: 2,
    source: 'LEADDRIVE',
    period: { kind: 'day', anchor: '2026-08-03', start: '2026-08-03', endExclusive: '2026-08-04' },
    formula: { authoritative: true },
    visits: {
      planned: 7,
      completedPlanned: 4,
      completedTotal: 5,
      unplannedCompleted: 1,
      missed: 0,
      fulfillment: { numerator: 4, denominator: 7, percentage: 57.1 },
    },
    coverage: { overall: { numerator: 5, denominator: 8, percentage: 62.5 } },
    tasks: {
      assigned: 4,
      completed: 2,
      overdue: 1,
      completion: { numerator: 2, denominator: 4, percentage: 50 },
    },
    gps: {
      visitConfirmation: { numerator: 5, denominator: 5, percentage: 100 },
      points: 120,
    },
  },
}

function kpiWith(overrides: Record<string, unknown>) {
  return { success: true, data: { ...SAMPLE_KPI.data, ...overrides } }
}

function resetStore() {
  useKpiStore.setState({
    stats: null,
    loading: false,
    error: null,
    period: 'today',
    scopeKey: 'org-1:agent-1',
    requestGeneration: 0,
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  jest.clearAllMocks()
  resetStore()
  mockGetKpi.mockResolvedValue(SAMPLE_KPI)
})

// ─── fetchKpi ─────────────────────────────────────────────────────────────────

describe('fetchKpi', () => {
  it("asks the server for 'day' when the UI period is 'today'", async () => {
    await useKpiStore.getState().fetchKpi('today')
    expect(mockGetKpi).toHaveBeenCalledTimes(1)
    expect(mockGetKpi).toHaveBeenCalledWith('day')
  })

  it('passes week and month through unchanged', async () => {
    await useKpiStore.getState().fetchKpi('week')
    expect(mockGetKpi).toHaveBeenLastCalledWith('week')
    await useKpiStore.getState().fetchKpi('month')
    expect(mockGetKpi).toHaveBeenLastCalledWith('month')
  })

  it('sets stats after successful fetch', async () => {
    await useKpiStore.getState().fetchKpi('today')
    expect(useKpiStore.getState().stats).not.toBeNull()
  })

  it('sets loading=false after fetch completes', async () => {
    await useKpiStore.getState().fetchKpi('today')
    expect(useKpiStore.getState().loading).toBe(false)
  })

  it('sets loading=true during fetch', async () => {
    const loadingStates: boolean[] = []
    const unsubscribe = useKpiStore.subscribe((s) => {
      loadingStates.push(s.loading)
    })
    await useKpiStore.getState().fetchKpi('today')
    unsubscribe()
    expect(loadingStates).toContain(true)
    expect(useKpiStore.getState().loading).toBe(false)
  })

  it('sets error=null on successful fetch', async () => {
    useKpiStore.setState({ error: 'Previous error' })
    await useKpiStore.getState().fetchKpi('today')
    expect(useKpiStore.getState().error).toBeNull()
  })

  it('sets the period on the stats object', async () => {
    await useKpiStore.getState().fetchKpi('week')
    expect(useKpiStore.getState().stats?.period).toBe('week')
  })
})

// ─── stats.visits ─────────────────────────────────────────────────────────────

describe('stats.visits', () => {
  it('reports route progress as completed planned stops out of planned stops', async () => {
    await useKpiStore.getState().fetchKpi('today')
    const { stats } = useKpiStore.getState()
    expect(stats?.visits).toEqual({ completed: 4, total: 7 })
  })

  it('keeps unplanned work visible instead of hiding it in the plan ratio', async () => {
    await useKpiStore.getState().fetchKpi('today')
    expect(useKpiStore.getState().stats?.unplannedCompleted).toBe(1)
  })

  it('handles a day with nothing planned', async () => {
    mockGetKpi.mockResolvedValue(kpiWith({
      visits: { planned: 0, completedPlanned: 0, completedTotal: 0, unplannedCompleted: 0, missed: 0 },
    }))
    await useKpiStore.getState().fetchKpi('today')
    const { stats } = useKpiStore.getState()
    expect(stats?.visits).toEqual({ completed: 0, total: 0 })
  })
})

// ─── stats.tasks ──────────────────────────────────────────────────────────────

describe('stats.tasks', () => {
  it('maps the server task counters including overdue', async () => {
    await useKpiStore.getState().fetchKpi('today')
    expect(useKpiStore.getState().stats?.tasks).toEqual({ done: 2, total: 4, overdue: 1 })
  })

  it('handles a day with no tasks', async () => {
    mockGetKpi.mockResolvedValue(kpiWith({ tasks: { assigned: 0, completed: 0, overdue: 0 } }))
    await useKpiStore.getState().fetchKpi('today')
    expect(useKpiStore.getState().stats?.tasks).toEqual({ done: 0, total: 0, overdue: 0 })
  })
})

// ─── coverage and GPS ─────────────────────────────────────────────────────────

describe('stats.coverage and stats.gps', () => {
  it('carries the server ratios through untouched', async () => {
    await useKpiStore.getState().fetchKpi('today')
    const { stats } = useKpiStore.getState()
    expect(stats?.coverage).toEqual({ numerator: 5, denominator: 8, percentage: 62.5 })
    expect(stats?.gps.visitConfirmation).toEqual({ numerator: 5, denominator: 5, percentage: 100 })
    expect(stats?.gps.points).toBe(120)
  })

  it('reports a truncated server window as non-authoritative', async () => {
    mockGetKpi.mockResolvedValue(kpiWith({ formula: { authoritative: false } }))
    await useKpiStore.getState().fetchKpi('today')
    expect(useKpiStore.getState().stats?.authoritative).toBe(false)
  })
})

// ─── stats.photos ─────────────────────────────────────────────────────────────

describe('stats.photos', () => {
  it('is unknown rather than zero — the KPI contract does not measure photos', async () => {
    await useKpiStore.getState().fetchKpi('today')
    expect(useKpiStore.getState().stats?.photos.count).toBeNull()
  })
})

// ─── error handling ───────────────────────────────────────────────────────────

describe('fetchKpi — error handling', () => {
  it('sets error message on API failure', async () => {
    mockGetKpi.mockRejectedValue(new Error('Network error'))
    await useKpiStore.getState().fetchKpi('today')
    expect(useKpiStore.getState().error).toBe('Network error')
  })

  it('keeps stats=null on API failure', async () => {
    mockGetKpi.mockRejectedValue(new Error('Timeout'))
    await useKpiStore.getState().fetchKpi('today')
    expect(useKpiStore.getState().stats).toBeNull()
  })

  it('sets loading=false after error', async () => {
    mockGetKpi.mockRejectedValue(new Error('Timeout'))
    await useKpiStore.getState().fetchKpi('today')
    expect(useKpiStore.getState().loading).toBe(false)
  })
})

// ─── identity isolation ──────────────────────────────────────────────────────

describe('KPI identity isolation', () => {
  it('uses a tenant:user scope and rejects incomplete identity', () => {
    expect(kpiScopeKey('tenant-a', 'agent-a')).toBe('tenant-a:agent-a')
    expect(kpiScopeKey('tenant-a', null)).toBeNull()
    expect(kpiScopeKey(undefined, 'agent-a')).toBeNull()
  })

  it('clears prior stats immediately when the tenant or user changes', async () => {
    await useKpiStore.getState().fetchKpi('today')
    expect(useKpiStore.getState().stats).not.toBeNull()

    useKpiStore.getState().setScope('org-2:agent-2')

    expect(useKpiStore.getState().scopeKey).toBe('org-2:agent-2')
    expect(useKpiStore.getState().stats).toBeNull()
    expect(useKpiStore.getState().loading).toBe(false)
    expect(useKpiStore.getState().error).toBeNull()
  })

  it('does not request or display KPI without an authenticated scope', async () => {
    useKpiStore.getState().clearScope()

    await useKpiStore.getState().fetchKpi('today')

    expect(mockGetKpi).not.toHaveBeenCalled()
    expect(useKpiStore.getState().stats).toBeNull()
  })

  it('drops a delayed Agent A response after switching to Agent B', async () => {
    const delayedAgentA = deferred<typeof SAMPLE_KPI>()
    const agentBKpi = kpiWith({
      visits: { planned: 1, completedPlanned: 0, completedTotal: 0, unplannedCompleted: 0, missed: 0 },
    })

    mockGetKpi.mockReset()
    mockGetKpi
      .mockResolvedValueOnce(SAMPLE_KPI)
      .mockImplementationOnce(() => delayedAgentA.promise)
      .mockResolvedValueOnce(agentBKpi)

    useKpiStore.getState().setScope('org-a:agent-a')
    await useKpiStore.getState().fetchKpi('today')
    expect(useKpiStore.getState().stats?.visits.total).toBe(7)

    const pendingAgentARefresh = useKpiStore.getState().fetchKpi('today')
    expect(useKpiStore.getState().loading).toBe(true)

    useKpiStore.getState().setScope('org-b:agent-b')
    expect(useKpiStore.getState().stats).toBeNull()
    expect(useKpiStore.getState().loading).toBe(false)

    await useKpiStore.getState().fetchKpi('today')
    expect(useKpiStore.getState().scopeKey).toBe('org-b:agent-b')
    expect(useKpiStore.getState().stats?.visits.total).toBe(1)

    delayedAgentA.resolve(SAMPLE_KPI)
    await pendingAgentARefresh

    expect(useKpiStore.getState().scopeKey).toBe('org-b:agent-b')
    expect(useKpiStore.getState().stats?.visits.total).toBe(1)
    expect(useKpiStore.getState().loading).toBe(false)
  })
})

// ─── setPeriod ────────────────────────────────────────────────────────────────

describe('setPeriod', () => {
  it('updates the period state', async () => {
    useKpiStore.getState().setPeriod('week')
    expect(useKpiStore.getState().period).toBe('week')
  })

  it('calls fetchKpi after setting period', () => {
    let called = false
    mockGetKpi.mockImplementation(() => {
      called = true
      return Promise.resolve(SAMPLE_KPI)
    })
    useKpiStore.getState().setPeriod('month')
    expect(called).toBe(true)
  })

  it('sets stats.period to match the new period', async () => {
    await useKpiStore.getState().fetchKpi('month')
    expect(useKpiStore.getState().stats?.period).toBe('month')
  })
})
