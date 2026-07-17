import AsyncStorage from "@react-native-async-storage/async-storage"
import { create } from "zustand"
import {
  DashboardDeviceClass,
  DashboardWidgetId,
  DashboardWorkspace,
  layoutStorageKey,
  sanitizeWidgetIds,
} from "../screens/dashboard/dashboard-layout"

const STORAGE_KEY = "@mtm_dashboard_layouts_v2"

interface LayoutContext {
  tenantId: string
  userId: string
  workspace: DashboardWorkspace
  deviceClass: DashboardDeviceClass
}

interface DashboardLayoutState {
  layouts: Record<string, DashboardWidgetId[]>
  hydrated: boolean
  hydrate: () => Promise<void>
  setLayout: (context: LayoutContext, ids: DashboardWidgetId[]) => Promise<void>
  resetLayout: (context: LayoutContext) => Promise<void>
}

export const useDashboardLayoutStore = create<DashboardLayoutState>((set, get) => ({
  layouts: {},
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY)
      const parsed = raw ? JSON.parse(raw) : {}
      set({ layouts: parsed && typeof parsed === "object" ? parsed : {}, hydrated: true })
    } catch {
      set({ layouts: {}, hydrated: true })
    }
  },
  setLayout: async (context, ids) => {
    const key = layoutStorageKey(context.tenantId, context.userId, context.workspace, context.deviceClass)
    const next = { ...get().layouts, [key]: sanitizeWidgetIds(context.workspace, ids) }
    set({ layouts: next })
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  },
  resetLayout: async (context) => {
    const key = layoutStorageKey(context.tenantId, context.userId, context.workspace, context.deviceClass)
    const next = { ...get().layouts }
    delete next[key]
    set({ layouts: next })
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  },
}))
