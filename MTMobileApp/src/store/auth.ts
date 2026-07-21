import { create } from "zustand"
import { api } from "../services/api"
import { kpiScopeKey, useKpiStore } from "./kpi"
import { useBootstrapStore } from "./bootstrap"
import { clearOfflineScope, setOfflineScope } from "../services/offline-scope"
import { useSyncStatusStore } from "./sync-status"

interface Agent {
  id: string
  name: string
  email: string
  phone?: string
  role: string
  avatar?: string
  organizationId: string
  organizationName: string
}

interface AuthState {
  isLoggedIn: boolean
  isLoading: boolean
  hasServer: boolean
  serverDomain: string
  companyName: string
  agent: Agent | null
  /**
   * Set to "REVOKED" when the backend returns a mid-session 401 (fired
   * agent, suspended account, or deactivated org). LoginScreen reads
   * this to show a "access revoked" banner. Cleared on a fresh login
   * attempt via clearRevokedReason().
   */
  revokedReason: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  /**
   * Called by the api.ts unauthorized callback — flips the store to
   * logged-out without re-calling api.logout() (the interceptor already
   * cleared the token). Avoids double-work / recursion.
   */
  handleRevoked: (reason: string) => void
  clearRevokedReason: () => void
  switchServer: () => Promise<void>
  checkAuth: () => Promise<void>
  setServer: (domain: string, name: string) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  isLoggedIn: false,
  isLoading: true,
  hasServer: false,
  serverDomain: "",
  companyName: "",
  agent: null,
  revokedReason: null,

  login: async (email: string, password: string) => {
    useKpiStore.getState().clearScope()
    const result = await api.login(email, password)
    if (result.success) {
      setOfflineScope(result.data.agent?.organizationId, result.data.agent?.id)
      useKpiStore.getState().setScope(
        kpiScopeKey(result.data.agent?.organizationId, result.data.agent?.id),
      )
      set({ isLoggedIn: true, agent: result.data.agent })
    } else {
      throw new Error(result.error || "Login failed")
    }
  },

  logout: async () => {
    useKpiStore.getState().clearScope()
    useBootstrapStore.getState().clear()
    await api.logout()
    clearOfflineScope()
    useSyncStatusStore.getState().clear()
    set({ isLoggedIn: false, agent: null, revokedReason: null })
  },

  handleRevoked: (reason: string) => {
    // The api interceptor already called api.logout() (cleared token +
    // AsyncStorage). We only flip the store state here — no second
    // api.logout() to avoid double-work or recursion.
    useKpiStore.getState().clearScope()
    useBootstrapStore.getState().clear()
    clearOfflineScope()
    useSyncStatusStore.getState().clear()
    set({ isLoggedIn: false, agent: null, revokedReason: reason })
  },

  clearRevokedReason: () => {
    set({ revokedReason: null })
  },

  switchServer: async () => {
    useKpiStore.getState().clearScope()
    useBootstrapStore.getState().clear()
    await api.fullLogout()
    clearOfflineScope()
    useSyncStatusStore.getState().clear()
    // Also clear revokedReason so a revoked-banner from the previous tenant
    // doesn't carry over to the next tenant's login screen.
    set({ isLoggedIn: false, hasServer: false, serverDomain: "", companyName: "", agent: null, revokedReason: null })
  },

  setServer: (domain: string, name: string) => {
    set({ hasServer: true, serverDomain: domain, companyName: name })
  },

  checkAuth: async () => {
    useKpiStore.getState().clearScope()
    set({ isLoading: true })
    try {
      await api.init()

      // Check if server is configured
      const server = await api.getStoredServer()
      if (!server) {
        set({ isLoggedIn: false, hasServer: false, agent: null, isLoading: false })
        return
      }

      // Check if logged in
      const loggedIn = await api.isLoggedIn()
      if (loggedIn) {
        const agent = await api.getStoredAgent()
        setOfflineScope(agent?.organizationId, agent?.id)
        useKpiStore.getState().setScope(
          kpiScopeKey(agent?.organizationId, agent?.id),
        )
        set({
          isLoggedIn: true,
          hasServer: true,
          serverDomain: server,
          companyName: agent?.organizationName || server,
          agent,
          isLoading: false,
        })
      } else {
        clearOfflineScope()
        useSyncStatusStore.getState().clear()
        set({
          isLoggedIn: false,
          hasServer: true,
          serverDomain: server,
          companyName: server,
          agent: null,
          isLoading: false,
        })
      }
    } catch {
      clearOfflineScope()
      useSyncStatusStore.getState().clear()
      set({ isLoggedIn: false, hasServer: false, agent: null, isLoading: false })
    }
  },
}))
