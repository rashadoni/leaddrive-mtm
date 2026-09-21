import { create } from "zustand"
import { api } from "../services/api"
import {
  toBootstrap,
  type BootstrapData,
  type MobileCapability,
  type RouteFieldAccess,
  isTransportFailure,
  NOT_CONFIGURED,
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

/**
 * One bootstrap request, and a second one after re-reading the stored server.
 *
 * `api.init()` fills `baseUrl` from AsyncStorage at start-up. A screen that
 * asks before that finished — or after a cold start where the API client was
 * rebuilt — gets `Server not configured` thrown inside the app, with no
 * request made and nothing for a retry loop to recover from. Re-reading the
 * server costs two storage reads and turns a permanent dead end into one
 * retry that actually dials.
 */
async function bootstrapWithStoredServer() {
  try {
    return await api.getBootstrap()
  } catch (error) {
    if ((error as { message?: string })?.message !== NOT_CONFIGURED) throw error
    await api.init()
    return await api.getBootstrap()
  }
}

export const useBootstrapStore = create<BootstrapState>((set) => ({
  data: null,
  capabilities: [],
  routeFieldAccess: "pending",
  loading: false,

  fetchBootstrap: async () => {
    set({ loading: true })
    try {
      const res = await bootstrapWithStoredServer()
      if (res?.success && res.data) {
        const data = toBootstrap(res.data)
        set({
          data,
          capabilities: data.capabilities,
          routeFieldAccess: data.routeFieldAccess,
          loading: false,
        })
        // This APK never opens HRM data or creates HRM requests. It may
        // reconcile the server-owned workday only as its own minimal Route
        // Field execution/GPS boundary; the existing v1 outbox is retained
        // and can drain only through the server-confirmed Route Field path.
        return data.routeFieldAccess
      } else {
        set({ data: null, capabilities: [], loading: false, routeFieldAccess: "unavailable" })
        return "unavailable"
      }
    } catch (error) {
      // A request that never got an answer says nothing about entitlement.
      const access = isTransportFailure(error as { status?: number; message?: string }) ? "offline" : "unavailable"
      set({ data: null, capabilities: [], loading: false, routeFieldAccess: access })
      return access
    }
  },

  clear: () => set({ data: null, capabilities: [], routeFieldAccess: "pending", loading: false }),
}))
