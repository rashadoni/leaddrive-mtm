import AsyncStorage from "@react-native-async-storage/async-storage"
import { create } from "zustand"

const STORAGE_KEY = "@mtm_active_workday_v1"

export interface ActiveWorkday {
  key: string
  startedAt: string
}

interface WorkdayState {
  activeWorkday: ActiveWorkday | null
  hydrated: boolean
  hydrate: () => Promise<void>
  start: (key: string) => Promise<void>
  end: (key: string) => Promise<void>
}

export function workdayKey(tenantId?: string | null, userId?: string | null) {
  return `${tenantId || "unknown-tenant"}:${userId || "unknown-user"}`
}

export const useWorkdayStore = create<WorkdayState>((set, get) => ({
  activeWorkday: null,
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY)
      const parsed = raw ? JSON.parse(raw) : null
      const valid =
        parsed &&
        typeof parsed.key === "string" &&
        typeof parsed.startedAt === "string"
          ? (parsed as ActiveWorkday)
          : null
      set({ activeWorkday: valid, hydrated: true })
    } catch {
      set({ activeWorkday: null, hydrated: true })
    }
  },
  start: async (key) => {
    const activeWorkday = { key, startedAt: new Date().toISOString() }
    set({ activeWorkday })
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(activeWorkday))
  },
  end: async (key) => {
    if (get().activeWorkday?.key !== key) return
    set({ activeWorkday: null })
    await AsyncStorage.removeItem(STORAGE_KEY)
  },
}))
