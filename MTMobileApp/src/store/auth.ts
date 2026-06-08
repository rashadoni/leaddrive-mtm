import { create } from "zustand"
import { api } from "../services/api"

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
    const result = await api.login(email, password)
    if (result.success) {
      set({ isLoggedIn: true, agent: result.data.agent })
    } else {
      throw new Error(result.error || "Login failed")
    }
  },

  logout: async () => {
    await api.logout()
    set({ isLoggedIn: false, agent: null, revokedReason: null })
  },

  handleRevoked: (reason: string) => {
    // The api interceptor already called api.logout() (cleared token +
    // AsyncStorage). We only flip the store state here — no second
    // api.logout() to avoid double-work or recursion.
    set({ isLoggedIn: false, agent: null, revokedReason: reason })
  },

  clearRevokedReason: () => {
    set({ revokedReason: null })
  },

  switchServer: async () => {
    await api.fullLogout()
    set({ isLoggedIn: false, hasServer: false, serverDomain: "", companyName: "", agent: null })
  },

  setServer: (domain: string, name: string) => {
    set({ hasServer: true, serverDomain: domain, companyName: name })
  },

  checkAuth: async () => {
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
        set({
          isLoggedIn: true,
          hasServer: true,
          serverDomain: server,
          companyName: agent?.organizationName || server,
          agent,
          isLoading: false,
        })
      } else {
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
      set({ isLoggedIn: false, hasServer: false, agent: null, isLoading: false })
    }
  },
}))
