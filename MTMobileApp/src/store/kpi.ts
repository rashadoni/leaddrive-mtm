import { create } from "zustand"
import { api } from "../services/api"
import { serverPeriod, toKpiStats, type KpiPeriod, type KpiStats } from "../services/kpi"

export type { KpiPeriod, KpiStats } from "../services/kpi"

interface KpiState {
  stats: KpiStats | null
  loading: boolean
  error: string | null
  period: KpiPeriod
  scopeKey: string | null
  requestGeneration: number
  setScope: (scopeKey: string | null) => void
  clearScope: () => void
  fetchKpi: (period?: KpiPeriod) => Promise<void>
  setPeriod: (period: KpiPeriod) => void
}

export function kpiScopeKey(
  tenantId?: string | null,
  userId?: string | null,
): string | null {
  const tenant = tenantId?.trim()
  const user = userId?.trim()
  return tenant && user ? `${tenant}:${user}` : null
}

export const useKpiStore = create<KpiState>((set, get) => ({
  stats: null,
  loading: false,
  error: null,
  period: "today",
  scopeKey: null,
  requestGeneration: 0,

  setScope: (scopeKey) => {
    const state = get()
    if (state.scopeKey === scopeKey) return

    set({
      scopeKey,
      stats: null,
      loading: false,
      error: null,
      requestGeneration: state.requestGeneration + 1,
    })
  },

  clearScope: () => {
    set((state) => ({
      scopeKey: null,
      stats: null,
      loading: false,
      error: null,
      requestGeneration: state.requestGeneration + 1,
    }))
  },

  fetchKpi: async (period?: KpiPeriod): Promise<void> => {
    const state = get()
    const scopeKey = state.scopeKey
    if (!scopeKey) {
      set({ stats: null, loading: false, error: null })
      return
    }

    const effectivePeriod = period ?? state.period
    const requestGeneration = state.requestGeneration + 1
    set({ loading: true, error: null, requestGeneration })

    try {
      // Server-owned formulas, one call. This used to count /visits, /tasks and
      // /photos client-side — but those lists carry no date filter, so a widget
      // captioned "today" was really counting the first page of all-time rows.
      const payload = await api.getKpi(serverPeriod(effectivePeriod))
      const stats = toKpiStats(payload, effectivePeriod)

      if (
        get().scopeKey !== scopeKey ||
        get().requestGeneration !== requestGeneration
      ) {
        return
      }

      set({ stats, loading: false, error: null })
    } catch (e: unknown) {
      if (
        get().scopeKey !== scopeKey ||
        get().requestGeneration !== requestGeneration
      ) {
        return
      }

      const errorMsg = e instanceof Error ? e.message : String(e)
      set({ stats: null, loading: false, error: errorMsg })
    }
  },

  setPeriod: (period: KpiPeriod): void => {
    set({ period })
    void get().fetchKpi(period)
  },
}))
