import { create } from "zustand"
import { api } from "../services/api"
// The i18next instance itself: ../i18n pulls a native module into every store test.
import i18next from "i18next"
import { getOfflineScope } from "../services/offline-scope"
import { forgetAttendanceOffline, rememberAttendanceOnline, restoreAttendanceOffline } from '../services/attendance-offline'
import { useSyncStatusStore } from './sync-status'
import { clearOfflineBootstrap, readOfflineBootstrap, rememberOfflineBootstrap } from "../services/bootstrap-offline-cache"
let bootstrapGeneration = 0
let offlineExpiryTimer: ReturnType<typeof setTimeout> | null = null
function stopOfflineExpiry() {
  if (offlineExpiryTimer) clearTimeout(offlineExpiryTimer)
  offlineExpiryTimer = null
}
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
  offlineValidUntil: number | null
  /**
   * Load /mobile/bootstrap. Never throws; transport failures may retain only
   * an explicit bounded server offline grant, never a locally cached role.
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

async function offlineBinding(scope: string | null) {
  if (!scope) return null
  try {
    const binding = await api.getOfflineBootstrapBinding?.()
    return binding ? { ...binding, scope } : null
  } catch { return null }
}

export const useBootstrapStore = create<BootstrapState>((set, get) => ({
  data: null,
  capabilities: [],
  routeFieldAccess: "pending",
  loading: false,
  offlineValidUntil: null,

  fetchBootstrap: async () => {
    const generation = ++bootstrapGeneration, scope = getOfflineScope()
    const requestedAt = Date.now()
    const current = () => generation === bootstrapGeneration && scope === getOfflineScope()
    set({ loading: true })
    try {
      // Keep Time's immediate bounded offline admission. Field agents still
      // probe the server, so a stale connectivity hint cannot pin field access.
      if (api.agentRole !== "AGENT" && useSyncStatusStore.getState().online === false) throw new Error("NETWORK_OFFLINE")
      const res = await bootstrapWithStoredServer()
      if (!current()) return "unavailable"
      if (res?.success && res.data) {
        // The server writes this agent's notices in the app's language.
        void api.reportAppLanguage?.(i18next.language)
        const data = toBootstrap(res.data)
        const binding = await offlineBinding(scope)
        if (!current()) return "unavailable"
        stopOfflineExpiry()
        set({
          data,
          capabilities: data.capabilities,
          routeFieldAccess: data.routeFieldAccess,
          loading: false,
          offlineValidUntil: null,
        })
        await rememberAttendanceOnline(data, scope, current).catch(() => {})
        if (!current()) return "unavailable"
        // Each product validates and stores only its own bounded entitlement.
        await rememberOfflineBootstrap(data, res.data.offlineGrant, binding, current, requestedAt).catch(() => {})
        if (!current()) return "unavailable"
        // Retired HRM routes remain closed. New own attendance requests
        // require their explicit permission and use a separate API. The app
        // reconciles the server-owned workday as its own minimal Route
        // Field execution/GPS boundary; the existing v1 outbox is retained
        // and can drain only through the server-confirmed Route Field path.
        return data.routeFieldAccess
      } else {
        stopOfflineExpiry()
        set({ data: null, capabilities: [], loading: false, routeFieldAccess: "unavailable", offlineValidUntil: null })
        await forgetAttendanceOffline().catch(() => {})
        await clearOfflineBootstrap().catch(() => {})
        return "unavailable"
      }
    } catch (error) {
      if (!current()) return "unavailable"
      // A request that never got an answer says nothing about entitlement.
      const access = isTransportFailure(error as { status?: number; message?: string }) ? "offline" : "unavailable"
      const attendance = access === "offline" ? await restoreAttendanceOffline(scope, current) : null
      if (!current()) return "unavailable"
      if (attendance) {
        stopOfflineExpiry()
        set({ data: attendance, capabilities: [], loading: false, routeFieldAccess: "offline", offlineValidUntil: null })
        return "offline"
      }
      if (access !== "offline") await forgetAttendanceOffline().catch(() => {})
      if (!current()) return "unavailable"
      if (access === "offline") {
        const cached = await readOfflineBootstrap(await offlineBinding(scope), current).catch(() => null)
        if (!current()) return "unavailable"
        if (cached) {
          stopOfflineExpiry()
          set({ data: cached.data, capabilities: cached.data.capabilities, loading: false,
            routeFieldAccess: "offline-enabled", offlineValidUntil: cached.validUntil })
          offlineExpiryTimer = setTimeout(() => {
            if (scope === getOfflineScope() && get().offlineValidUntil === cached.validUntil) {
              set({ data: null, capabilities: [], routeFieldAccess: "offline", loading: false, offlineValidUntil: null })
              void clearOfflineBootstrap().catch(() => {})
            }
          }, Math.max(0, cached.validUntil - Date.now()))
          return "offline-enabled"
        }
      }
      stopOfflineExpiry()
      set({ data: null, capabilities: [], loading: false, routeFieldAccess: access, offlineValidUntil: null })
      await clearOfflineBootstrap().catch(() => {})
      return access
    }
  },

  clear: () => {
    bootstrapGeneration += 1
    stopOfflineExpiry()
    set({ data: null, capabilities: [], routeFieldAccess: "pending", loading: false, offlineValidUntil: null })
    void forgetAttendanceOffline().catch(() => {})
    void clearOfflineBootstrap().catch(() => {})
  },
}))
