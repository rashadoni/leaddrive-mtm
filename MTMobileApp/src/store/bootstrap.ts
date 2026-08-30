import { create } from "zustand"
import { api } from "../services/api"
import {
  toBootstrap,
  type BootstrapData,
  type MobileCapability,
  type RouteFieldAccess,
} from "../services/bootstrap"

interface BootstrapState {
  data: BootstrapData | null
  capabilities: MobileCapability[]
  /** Server-authoritative product admission for this Route Field APK. */
  routeFieldAccess: RouteFieldAccess
  loading: boolean
  /**
   * Load /mobile/bootstrap. Never throws; a failure fails closed and does not
   * infer Route Field access from the locally cached role.
   */
  fetchBootstrap: () => Promise<RouteFieldAccess>
  clear: () => void
}

export const useBootstrapStore = create<BootstrapState>((set) => ({
  data: null,
  capabilities: [],
  routeFieldAccess: "pending",
  loading: false,

  fetchBootstrap: async () => {
    set({ loading: true })
    try {
      const res = await api.getBootstrap()
      if (res?.success && res.data) {
        const data = toBootstrap(res.data)
        set({
          data,
          capabilities: data.capabilities,
          routeFieldAccess: data.routeFieldAccess,
          loading: false,
        })
        // This APK intentionally does not reconcile or create HRM workdays.
        // A pre-existing v1 outbox is retained for recovery, but only the
        // server-confirmed Route Field sync path may drain it.
        return data.routeFieldAccess
      } else {
        set({ data: null, capabilities: [], loading: false, routeFieldAccess: "unavailable" })
        return "unavailable"
      }
    } catch {
      set({ data: null, capabilities: [], loading: false, routeFieldAccess: "unavailable" })
      return "unavailable"
    }
  },

  clear: () => set({ data: null, capabilities: [], routeFieldAccess: "pending", loading: false }),
}))
