/**
 * G4 — KPI store for the Dashboard screen.
 *
 * Aggregates visit, task and photo counts from existing API
 * endpoints (orders were removed with the LeadShelf split — the server
 * no longer has an orders domain). The mobile dashboard screen relies on this store to
 * surface daily/weekly/monthly agent performance without a dedicated
 * backend endpoint.
 *
 * Covered:
 *   fetchKpi('today') — aggregates data from api calls, sets stats
 *   fetchKpi sets loading=true during fetch, false after
 *   fetchKpi sets error on API failure
 *   setPeriod updates period and triggers refetch
 *   stats.visits reflects completed vs total from getVisits response
 *   stats.tasks reflects done vs total from getTasks response
 */

jest.mock('../../src/services/api', () => ({
  api: {
    getVisits: jest.fn(),
    getTasks: jest.fn(),
    getPhotos: jest.fn(),
  },
}))

import { api } from '../../src/services/api'
import { useKpiStore } from '../../src/store/kpi'

const mockGetVisits = api.getVisits as jest.Mock
const mockGetTasks = api.getTasks as jest.Mock
const mockGetPhotos = api.getPhotos as jest.Mock

// REGRESSION 2026-06-12: the API wraps each array inside data.<entity>
// ({ data: { visits: [...] } }), NOT data itself. These fixtures previously
// put the array directly at `data`, which matched the BUGGY store code
// (`res.data.filter(...)` on an object → "undefined is not a function", whole
// Dashboard broke). Verified the real server shape via curl, fixtures corrected.
const SAMPLE_VISITS = {
  success: true,
  data: {
    visits: [
      { id: 'v-1', status: 'CHECKED_OUT' },
      { id: 'v-2', status: 'CHECKED_IN' },
      { id: 'v-3', status: 'CHECKED_OUT' },
    ],
  },
}

const SAMPLE_TASKS = {
  success: true,
  data: {
    tasks: [
      { id: 't-1', status: 'DONE' },
      { id: 't-2', status: 'COMPLETED' },
      { id: 't-3', status: 'TODO' },
      { id: 't-4', status: 'IN_PROGRESS' },
    ],
  },
}

const SAMPLE_PHOTOS = {
  success: true,
  data: {
    photos: [
      { id: 'p-1' },
      { id: 'p-2' },
      { id: 'p-3' },
      { id: 'p-4' },
      { id: 'p-5' },
    ],
  },
}

function resetStore() {
  useKpiStore.setState({
    stats: null,
    loading: false,
    error: null,
    period: 'today',
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  resetStore()
  mockGetVisits.mockResolvedValue(SAMPLE_VISITS)
  mockGetTasks.mockResolvedValue(SAMPLE_TASKS)
  mockGetPhotos.mockResolvedValue(SAMPLE_PHOTOS)
})

// ─── fetchKpi ─────────────────────────────────────────────────────────────────

describe('fetchKpi', () => {
  it("calls getVisits, getTasks, getPhotos in parallel", async () => {
    await useKpiStore.getState().fetchKpi('today')
    expect(mockGetVisits).toHaveBeenCalledTimes(1)
    expect(mockGetTasks).toHaveBeenCalledTimes(1)
    expect(mockGetPhotos).toHaveBeenCalledTimes(1)
  })

  it('sets stats after successful fetch', async () => {
    await useKpiStore.getState().fetchKpi('today')
    const { stats } = useKpiStore.getState()
    expect(stats).not.toBeNull()
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
    // First set an error state
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
  it('counts CHECKED_OUT visits as completed', async () => {
    await useKpiStore.getState().fetchKpi('today')
    const { stats } = useKpiStore.getState()
    // SAMPLE_VISITS has 2 CHECKED_OUT
    expect(stats?.visits.completed).toBe(2)
  })

  it('counts all visits as total', async () => {
    await useKpiStore.getState().fetchKpi('today')
    const { stats } = useKpiStore.getState()
    // SAMPLE_VISITS has 3 total
    expect(stats?.visits.total).toBe(3)
  })

  it('handles empty visits array', async () => {
    mockGetVisits.mockResolvedValue({ success: true, data: { visits: [] } })
    await useKpiStore.getState().fetchKpi('today')
    const { stats } = useKpiStore.getState()
    expect(stats?.visits.completed).toBe(0)
    expect(stats?.visits.total).toBe(0)
  })
})

// ─── stats.tasks ──────────────────────────────────────────────────────────────

describe('stats.tasks', () => {
  it('counts tasks with status DONE or COMPLETED as done', async () => {
    await useKpiStore.getState().fetchKpi('today')
    const { stats } = useKpiStore.getState()
    // SAMPLE_TASKS has 2 DONE/COMPLETED
    expect(stats?.tasks.done).toBe(2)
  })

  it('counts all tasks as total', async () => {
    await useKpiStore.getState().fetchKpi('today')
    const { stats } = useKpiStore.getState()
    // SAMPLE_TASKS has 4 total
    expect(stats?.tasks.total).toBe(4)
  })

  it('handles empty tasks array', async () => {
    mockGetTasks.mockResolvedValue({ success: true, data: { tasks: [] } })
    await useKpiStore.getState().fetchKpi('today')
    const { stats } = useKpiStore.getState()
    expect(stats?.tasks.done).toBe(0)
    expect(stats?.tasks.total).toBe(0)
  })
})

// ─── stats.photos ─────────────────────────────────────────────────────────────

describe('stats.photos', () => {
  it('counts all photos', async () => {
    await useKpiStore.getState().fetchKpi('today')
    const { stats } = useKpiStore.getState()
    // SAMPLE_PHOTOS has 5 photos
    expect(stats?.photos.count).toBe(5)
  })
})

// ─── error handling ───────────────────────────────────────────────────────────

describe('fetchKpi — error handling', () => {
  it('sets error message on API failure', async () => {
    mockGetVisits.mockRejectedValue(new Error('Network error'))
    await useKpiStore.getState().fetchKpi('today')
    expect(useKpiStore.getState().error).toBe('Network error')
  })

  it('keeps stats=null on API failure', async () => {
    mockGetVisits.mockRejectedValue(new Error('Timeout'))
    await useKpiStore.getState().fetchKpi('today')
    expect(useKpiStore.getState().stats).toBeNull()
  })

  it('sets loading=false after error', async () => {
    mockGetVisits.mockRejectedValue(new Error('Timeout'))
    await useKpiStore.getState().fetchKpi('today')
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
    // Intercept at the api level (cleaner than spying on state method)
    mockGetVisits.mockImplementation(() => {
      called = true
      return Promise.resolve(SAMPLE_VISITS)
    })
    useKpiStore.getState().setPeriod('month')
    expect(called).toBe(true)
  })

  it('sets stats.period to match the new period', async () => {
    // Directly call fetchKpi with 'month' and await it
    await useKpiStore.getState().fetchKpi('month')
    expect(useKpiStore.getState().stats?.period).toBe('month')
  })
})
