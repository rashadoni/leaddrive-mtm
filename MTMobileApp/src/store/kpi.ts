import { create } from "zustand"
import { api } from "../services/api"

export type KpiPeriod = "today" | "week" | "month"

export interface KpiStats {
  visits: { completed: number; total: number }
  tasks: { done: number; total: number }
  photos: { count: number }
  period: KpiPeriod
}

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
      const [visitsRes, tasksRes, photosRes] = await Promise.all([
        api.getVisits(),
        api.getTasks(),
        api.getPhotos(),
      ])

      // The API wraps each array inside data.<entity>
      // ({ data: { visits: [...] } }) — NOT data itself. Reading data directly
      // gave an OBJECT, and `obj.filter()` threw "undefined is not a function",
      // breaking the whole Dashboard (reproduced on the emulator 2026-06-12).
      const visits: { id: string; status: string }[] = visitsRes?.data?.visits ?? []
      const tasks: { id: string; status: string }[] = tasksRes?.data?.tasks ?? []
      const photos: unknown[] = photosRes?.data?.photos ?? []

      const completedVisits = visits.filter((v) => v.status === "CHECKED_OUT").length
      const doneTasks = tasks.filter(
        (t) => t.status === "DONE" || t.status === "COMPLETED"
      ).length

      const stats: KpiStats = {
        visits: { completed: completedVisits, total: visits.length },
        tasks: { done: doneTasks, total: tasks.length },
        photos: { count: photos.length },
        period: effectivePeriod,
      }

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
