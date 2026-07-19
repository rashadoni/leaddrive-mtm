import { create } from "zustand"
import { api } from "../services/api"
import { toBootstrap, type BootstrapData, type MobileCapability } from "../services/bootstrap"
import { useWorkdayStore, workdayKey } from "./workday"

interface BootstrapState {
  data: BootstrapData | null
  capabilities: MobileCapability[]
  loading: boolean
  /** Load /mobile/bootstrap. Never throws — a failure leaves capabilities empty
   *  so navigation falls back to the role-derived group. */
  fetchBootstrap: () => Promise<void>
  clear: () => void
}

export const useBootstrapStore = create<BootstrapState>((set) => ({
  data: null,
  capabilities: [],
  loading: false,

  fetchBootstrap: async () => {
    set({ loading: true })
    try {
      const res = await api.getBootstrap()
      if (res?.success && res.data) {
        const data = toBootstrap(res.data)
        set({ data, capabilities: data.capabilities, loading: false })
        // Reconcile the local workday with the authoritative server shift.
        const key = workdayKey(data.tenant?.id, data.principal?.id)
        void useWorkdayStore.getState().reconcileFromServer(key, data.workday)
      } else {
        set({ loading: false })
      }
    } catch {
      set({ loading: false })
    }
  },

  clear: () => set({ data: null, capabilities: [], loading: false }),
}))
