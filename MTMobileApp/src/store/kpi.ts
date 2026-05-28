import { create } from "zustand"
import { api } from "../services/api"

export type KpiPeriod = "today" | "week" | "month"

export interface KpiStats {
  visits: { completed: number; total: number }
  orders: { count: number }
  tasks: { done: number; total: number }
  photos: { count: number }
  period: KpiPeriod
}

interface KpiState {
  stats: KpiStats | null
  loading: boolean
  error: string | null
  period: KpiPeriod
  fetchKpi: (period?: KpiPeriod) => Promise<void>
  setPeriod: (period: KpiPeriod) => void
}

export const useKpiStore = create<KpiState>((set, get) => ({
  stats: null,
  loading: false,
  error: null,
  period: "today",

  fetchKpi: async (period?: KpiPeriod): Promise<void> => {
    const effectivePeriod = period ?? get().period
    set({ loading: true, error: null })

    try {
      const [visitsRes, ordersRes, tasksRes, photosRes] = await Promise.all([
        api.getVisits(),
        api.getOrders(),
        api.getTasks(),
        api.getPhotos(),
      ])

      const visits: { id: string; status: string }[] = visitsRes?.data ?? []
      const orders: unknown[] = ordersRes?.data ?? []
      const tasks: { id: string; status: string }[] = tasksRes?.data ?? []
      const photos: unknown[] = photosRes?.data ?? []

      const completedVisits = visits.filter((v) => v.status === "CHECKED_OUT").length
      const doneTasks = tasks.filter(
        (t) => t.status === "DONE" || t.status === "COMPLETED"
      ).length

      const stats: KpiStats = {
        visits: { completed: completedVisits, total: visits.length },
        orders: { count: orders.length },
        tasks: { done: doneTasks, total: tasks.length },
        photos: { count: photos.length },
        period: effectivePeriod,
      }

      set({ stats, loading: false, error: null })
    } catch (e: unknown) {
      const errorMsg = e instanceof Error ? e.message : String(e)
      set({ stats: null, loading: false, error: errorMsg })
    }
  },

  setPeriod: (period: KpiPeriod): void => {
    set({ period })
    void get().fetchKpi(period)
  },
}))
