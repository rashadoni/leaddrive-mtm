/**
 * Pure mapping for GET /mobile/kpi (services/kpi.ts).
 *
 * The mapper is the boundary between a server contract that may grow and a
 * dashboard that must never crash or invent numbers. Two properties matter:
 * an unknown/partial payload degrades quietly, and "not measured" stays
 * distinguishable from "measured as zero".
 */

import { serverPeriod, toKpiStats } from '../../src/services/kpi'

const FULL = {
  success: true,
  data: {
    formula: { authoritative: true },
    visits: {
      planned: 7,
      completedPlanned: 4,
      completedTotal: 5,
      unplannedCompleted: 1,
      missed: 2,
    },
    coverage: { overall: { numerator: 5, denominator: 8, percentage: 62.5 } },
    tasks: { assigned: 4, completed: 2, overdue: 1 },
    gps: { visitConfirmation: { numerator: 5, denominator: 5, percentage: 100 }, points: 120 },
  },
}

describe('serverPeriod', () => {
  it("translates the UI's 'today' into the contract's 'day'", () => {
    expect(serverPeriod('today')).toBe('day')
  })

  it('leaves week and month alone', () => {
    expect(serverPeriod('week')).toBe('week')
    expect(serverPeriod('month')).toBe('month')
  })
})

describe('toKpiStats', () => {
  it('maps a complete payload', () => {
    const stats = toKpiStats(FULL, 'today')
    expect(stats).toEqual({
      visits: { completed: 4, total: 7 },
      unplannedCompleted: 1,
      missed: 2,
      tasks: { done: 2, total: 4, overdue: 1 },
      coverage: { numerator: 5, denominator: 8, percentage: 62.5 },
      gps: {
        visitConfirmation: { numerator: 5, denominator: 5, percentage: 100 },
        points: 120,
      },
      photos: { count: null },
      period: 'today',
      authoritative: true,
    })
  })

  it('reports photo evidence as unknown, never as zero', () => {
    // 0 would read as "no photos taken"; the contract simply does not measure
    // them, and the dashboard renders "—" for null.
    expect(toKpiStats(FULL, 'today').photos.count).toBeNull()
  })

  it('degrades an empty payload to zeros and nulls instead of throwing', () => {
    const stats = toKpiStats({}, 'week')
    expect(stats.visits).toEqual({ completed: 0, total: 0 })
    expect(stats.tasks).toEqual({ done: 0, total: 0, overdue: 0 })
    expect(stats.coverage).toBeNull()
    expect(stats.gps.visitConfirmation).toBeNull()
    expect(stats.period).toBe('week')
  })

  it.each([null, undefined, 'nonsense', 42, []])('survives a junk payload: %p', (payload) => {
    expect(() => toKpiStats(payload, 'today')).not.toThrow()
    expect(toKpiStats(payload, 'today').visits.total).toBe(0)
  })

  it('ignores non-numeric counters rather than propagating NaN', () => {
    const stats = toKpiStats(
      { data: { visits: { planned: 'seven', completedPlanned: null } } },
      'today',
    )
    expect(stats.visits).toEqual({ completed: 0, total: 0 })
  })

  it('treats a missing authoritative flag as authoritative', () => {
    // An older server never truncated, so absence must not read as "partial".
    expect(toKpiStats({ data: {} }, 'today').authoritative).toBe(true)
  })

  it('marks a truncated server window as non-authoritative', () => {
    expect(toKpiStats({ data: { formula: { authoritative: false } } }, 'today').authoritative)
      .toBe(false)
  })
})
