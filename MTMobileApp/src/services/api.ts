import AsyncStorage from "@react-native-async-storage/async-storage"
import { setAgentContext, clearAgentContext } from "./sentry"
import { retryAfterMsFromHeader, type RetryableSyncError } from "./sync-retry"
import { getFieldDeviceId } from "./field-device-id"
import { ROUTE_FIELD_PROFILE } from "../runtime/route-field-profile"

/**
 * Canonical reason string set when the backend returns a mid-session 401
 * (agent fired, org suspended, etc.). Referenced in api.ts (both 401
 * interception points) and LoginScreen ("access revoked" banner check).
 * Centralised here so all three sites can't drift independently.
 */
export const REVOKED_REASON = "REVOKED"

const STORAGE_KEY_TOKEN = "@mtm_token"
const STORAGE_KEY_AGENT = "@mtm_agent"
const STORAGE_KEY_SERVER = "@mtm_server"
const STORAGE_KEY_CREDENTIALS = "@mtm_saved_login"

// Server discovery includes a cold TLS handshake through the tenant proxy.
// Ten seconds is too aggressive on entry-level Android devices and on
// software-accelerated emulators, where an otherwise healthy tenant can be
// reported as missing before the handshake completes.
const SERVER_DISCOVERY_TIMEOUT_MS = 30_000

class ApiClient {
  private token: string | null = null
  private agentId: string | null = null
  /**
   * Registered by App.tsx after api.init() to avoid a circular import
   * (api.ts must not import the store). When a mid-session 401 arrives
   * the interceptor calls this callback AFTER clearing the local token,
   * so the store can flip isLoggedIn → false and surface the revoked UX.
   */
  private _onUnauthorized: ((reason?: string) => void) | null = null

  setUnauthorizedHandler(fn: (reason?: string) => void): void {
    this._onUnauthorized = fn
  }
  // F-28 follow-up: agent role drives client-side gating of geofence
  // override prompts. Server still authoritatively rejects unprivileged
  // overrides; this is UX so a regular AGENT doesn't see a button that
  // will 403 server-side.
  private _agentRole: string | null = null
  // M1-2: cached for photo watermark composition. agentName goes into
  // the visible watermark; agentCode falls back to the trailing 6 chars
  // of the agent id if the backend doesn't return a separate field.
  private _agentName: string | null = null
  private _agentCode: string | null = null
  private baseUrl: string = ""

  async init() {
    const server = await AsyncStorage.getItem(STORAGE_KEY_SERVER)
    if (server) {
      this.baseUrl = `${this.protocol(server)}://${server}/api/v1/mtm`
    }
    this.token = await AsyncStorage.getItem(STORAGE_KEY_TOKEN)
    const agentRaw = await AsyncStorage.getItem(STORAGE_KEY_AGENT)
    if (agentRaw) {
      try {
        const agent = JSON.parse(agentRaw)
        this.agentId = agent.id || null
        this._agentRole = agent.role || null
        this._agentName = agent.name || null
        this._agentCode = agent.code || null
      } catch (e) {
        console.warn("Failed to parse stored agent:", e)
      }
    }
    // Security migration: older builds stored { email, password } as plain
    // JSON in AsyncStorage. Keep only the convenience email and erase the
    // password even when the user is already signed in and never sees Login.
    await this.getSavedCredentials()
  }

  /** Role of the currently authenticated agent, or null if not signed in. */
  get agentRole(): string | null {
    return this._agentRole
  }

  /**
   * Current agent identity for client-side use (M1-2 photo watermark
   * composer needs id + name + code). Returns null when not signed in.
   * agentCode falls back to the last 6 chars of agentId if the backend
   * doesn't ship a separate `code` field — `#A042` style suffix works
   * either way in the watermark text.
   */
  get currentAgent(): { id: string; name: string; code: string; role: string | null } | null {
    if (!this.agentId) return null
    return {
      id: this.agentId,
      name: this._agentName ?? "Unknown",
      code: this._agentCode ?? this.agentId.slice(-6).toUpperCase(),
      role: this._agentRole,
    }
  }

  /** True if the current agent may bypass geofence (F-28 server contract). */
  get canForceCheckIn(): boolean {
    return this._agentRole === "ADMIN" || this._agentRole === "MANAGER" || this._agentRole === "SUPERVISOR"
  }

  // --- Server discovery ---

  /**
   * Resolve user input to full domain.
   * "app" → "app.leaddrivecrm.org"
   * "guven" → "guven.leaddrivecrm.org"
   * "fanum.tech" → "fanum.tech"
   */
  private resolveDomain(input: string): string {
    if (input.includes(".") || input.includes(":")) return input
    return `${input}.leaddrivecrm.org`
  }

  /** Use http:// for localhost/IP addresses, https:// for domains */
  private protocol(domain: string): string {
    if (domain.startsWith("localhost") || domain.startsWith("10.0.2.2") || domain.startsWith("127.") || domain.startsWith("192.168.")) return "http"
    return "https"
  }

  /**
   * Resolve a server media path to an absolute URL the RN <Image> can load.
   * The backend stores referenceImageUrl / photo urls as ROOT-relative paths
   * ("/uploads/mtm-photos/x.jpg"); RN <Image source={{uri}}> needs an absolute
   * http(s) URL, so a relative path renders blank. We strip the "/api/v1/mtm"
   * suffix off baseUrl to get the server ORIGIN and prefix the path with it.
   * Already-absolute URLs pass through unchanged; null/empty → null.
   */
  resolveMediaUrl(path: string | null | undefined): string | null {
    if (!path) return null
    if (/^https?:\/\//i.test(path)) return path
    if (!this.baseUrl) return null
    const origin = this.baseUrl.replace(/\/api\/v1\/mtm\/?$/, "")
    return `${origin}${path.startsWith("/") ? "" : "/"}${path}`
  }

  /**
   * Derive the tenant slug from the stored server domain. Server-side
   * mobile-auth uses this to scope the lookup to one (org, email) pair
   * — without it, an agent whose email collides with another tenant's
   * agent lands a token for a random org (F-35).
   *
   * Mapping rules:
   *   • app.leaddrivecrm.org  → "leaddrive"  (main tenant lives under "app")
   *   • <sub>.leaddrivecrm.org → "<sub>"
   *   • fanum.tech            → "fanum"      (apex domain, custom mapping)
   *   • localhost / IP        → undefined    (legacy fallback on dev)
   *
   * Returns `undefined` when no clean derivation is possible — server
   * will hit the F-35 legacy path with a deprecation log line.
   */
  private slugForDomain(domain: string): string | undefined {
    if (!domain) return undefined
    // Strip port
    const host = domain.replace(/:\d+$/, "").toLowerCase()
    if (host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith("10.0.2.2")) return undefined
    // *.leaddrivecrm.org pattern
    const ld = host.match(/^([a-z0-9-]+)\.leaddrivecrm\.org$/)
    if (ld) return ld[1] === "app" ? "leaddrive" : ld[1]
    // Custom-domain tenants (registry-driven). Hardcoded for now; the
    // mobile build doesn't ship the clients/registry.json, so the apex
    // → slug mapping is mirrored here. Add new tenants alongside.
    if (host === "fanum.tech") return "fanum"
    return undefined
  }

  /**
   * Ping a server to check if it exists and get company name.
   */
  async pingServer(input: string): Promise<{ success: boolean; domain: string; name?: string; error?: string }> {
    const domain = this.resolveDomain(input.trim().toLowerCase())
    const url = `${this.protocol(domain)}://${domain}/api/v1/mtm/mobile/ping`

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), SERVER_DISCOVERY_TIMEOUT_MS)

      try {
        const res = await fetch(url, { signal: controller.signal })
        const data = await res.json()
        if (data.success) {
          return { success: true, domain, name: data.data?.name }
        }
        return { success: false, domain, error: "Invalid server response" }
      } finally {
        clearTimeout(timeout)
      }
    } catch (e: any) {
      if (e.name === "AbortError") {
        return { success: false, domain, error: "Connection timeout" }
      }
      return { success: false, domain, error: "Server not found" }
    }
  }

  /**
   * Save selected server domain.
   */
  async setServer(domain: string) {
    this.baseUrl = `${this.protocol(domain)}://${domain}/api/v1/mtm`
    await AsyncStorage.setItem(STORAGE_KEY_SERVER, domain)
  }

  /**
   * Get stored server domain (null if not set).
   */
  async getStoredServer(): Promise<string | null> {
    return AsyncStorage.getItem(STORAGE_KEY_SERVER)
  }

  /**
   * Clear server selection (switch company).
   */
  async clearServer() {
    this.baseUrl = ""
    await AsyncStorage.removeItem(STORAGE_KEY_SERVER)
  }

  // --- Saved credentials ---

  async saveCredentials(email: string) {
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) {
      await this.clearCredentials()
      return
    }
    await AsyncStorage.setItem(STORAGE_KEY_CREDENTIALS, JSON.stringify({ email: normalizedEmail }))
  }

  async getSavedCredentials(): Promise<{ email: string } | null> {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_CREDENTIALS)
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as { email?: unknown; password?: unknown }
      const email = typeof parsed?.email === "string" ? parsed.email.trim().toLowerCase() : ""
      if (!email) {
        await AsyncStorage.removeItem(STORAGE_KEY_CREDENTIALS)
        return null
      }
      const safe = JSON.stringify({ email })
      if (raw !== safe) await AsyncStorage.setItem(STORAGE_KEY_CREDENTIALS, safe)
      return { email }
    } catch {
      await AsyncStorage.removeItem(STORAGE_KEY_CREDENTIALS)
      return null
    }
  }

  async clearCredentials() {
    await AsyncStorage.removeItem(STORAGE_KEY_CREDENTIALS)
  }

  // --- Request ---

  private baseForApiVersion(version: 1 | 2): string {
    if (version === 1) return this.baseUrl
    const base = this.baseUrl.replace(/\/api\/v1\/mtm\/?$/, "/api/v2/mtm")
    if (base === this.baseUrl) throw new Error("MOBILE_SYNC_V2_BASE_UNAVAILABLE")
    return base
  }

  private async request(path: string, options: RequestInit = {}, timeoutMs = 20_000, apiVersion: 1 | 2 = 1) {
    if (!this.baseUrl) throw new Error("Server not configured")

    const url = `${this.baseForApiVersion(apiVersion)}${path}`
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    }

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`
      // Device identity is deliberately opaque and installation-scoped; it is
      // never derived from the logged-in agent. If AsyncStorage is temporarily
      // unavailable, keep v1 compatible by omitting only the cohort header.
      headers["x-field-apk-version"] = ROUTE_FIELD_PROFILE.apkVersion
      try {
        headers["x-field-device-id"] = await getFieldDeviceId()
      } catch {}
    }

    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)

    if (options.signal) {
      const callerSignal = options.signal as AbortSignal
      if (callerSignal.aborted) {
        clearTimeout(timer)
        controller.abort()
      } else {
        callerSignal.addEventListener("abort", () => controller.abort(), { once: true })
      }
    }

    try {
      const res = await fetch(url, { ...options, headers, signal: controller.signal })
      const data = await res.json()

      if (res.status === 401) {
        // Gate the revoked-banner callback on a token being present:
        // a mid-session revocation ALWAYS has a token; the login request
        // does not (token is set only AFTER login succeeds). So login-401
        // (wrong password / agent-not-found) stays as a normal credentials
        // error and never surfaces the "access revoked" banner.
        const hadToken = !!this.token
        await this.logout()
        if (hadToken) {
          this._onUnauthorized?.(REVOKED_REASON)
        }
        throw new Error("SESSION_EXPIRED")
      }

      if (!res.ok) {
        // Surface the server's machine-readable error code (e.g. the 422
        // codes PHOTO_REQUIRED / MAX_PHOTOS_REACHED) so screens can react
        // specifically instead of showing a generic failure toast.
        const err = new Error(data.error || `Request failed: ${res.status}`) as RetryableSyncError
        err.code = data.code
        err.status = res.status
        err.retryAfterMs = retryAfterMsFromHeader(res.headers?.get?.("Retry-After"))
        if (typeof data.recommendedPageSize === "number" && Number.isFinite(data.recommendedPageSize)) {
          err.recommendedPageSize = Math.max(1, Math.min(500, Math.floor(data.recommendedPageSize)))
        }
        throw err
      }

      return data
    } catch (e: any) {
      if (e.name === "AbortError") throw new Error(timedOut ? "REQUEST_TIMEOUT" : "ABORTED")
      throw e
    } finally {
      clearTimeout(timer)
    }
  }

  // --- Auth ---

  async login(email: string, password: string) {
    // F-35: tenant-scope the lookup so an agent with a colliding email in
    // another org can't accidentally log into the wrong tenant. The slug
    // is derived from the stored server domain ("app" → "leaddrive",
    // "afigroup" → "afigroup", "fanum.tech" → "fanum"); when no clean
    // derivation is possible we omit the field and the server falls
    // through to the legacy path with a deprecation warning.
    const storedServer = await AsyncStorage.getItem(STORAGE_KEY_SERVER)
    const organizationSlug = storedServer ? this.slugForDomain(storedServer) : undefined
    const data = await this.request("/mobile/auth", {
      method: "POST",
      body: JSON.stringify({ email, password, ...(organizationSlug ? { organizationSlug } : {}) }),
    })

    if (data.success && data.data.token) {
      this.token = data.data.token
      this.agentId = data.data.agent?.id || null
      this._agentRole = data.data.agent?.role || null
      this._agentName = data.data.agent?.name || null
      this._agentCode = data.data.agent?.code || null
      await AsyncStorage.setItem(STORAGE_KEY_TOKEN, data.data.token)
      await AsyncStorage.setItem(STORAGE_KEY_AGENT, JSON.stringify(data.data.agent))
      // M1-3: surface agent identity to Sentry so field crashes can be
      // filtered per-rep and per-org. Org id isn't returned by login
      // (it's bound on the server side via subdomain), so we attach
      // only agentId here.
      setAgentContext(this.agentId, data.data.agent?.organizationId ?? null)
    }

    return data
  }

  async logout() {
    this.token = null
    this.agentId = null
    this._agentRole = null
    this._agentName = null
    this._agentCode = null
    await AsyncStorage.multiRemove([STORAGE_KEY_TOKEN, STORAGE_KEY_AGENT])
    // M1-3: wipe Sentry scope so anonymous post-logout traces aren't
    // misattributed to the previous user.
    clearAgentContext()
  }

  /**
   * Full logout — clear server, credentials, and auth.
   */
  async fullLogout() {
    await this.logout()
    await this.clearServer()
    await this.clearCredentials()
  }

  async isLoggedIn(): Promise<boolean> {
    if (!this.baseUrl) return false
    if (!this.token) {
      this.token = await AsyncStorage.getItem(STORAGE_KEY_TOKEN)
    }
    return !!this.token
  }

  async getStoredAgent() {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_AGENT)
    return raw ? JSON.parse(raw) : null
  }

  // --- Bootstrap ---

  async getBootstrap(signal?: AbortSignal) {
    return this.request("/mobile/bootstrap", { signal })
  }

  // --- Profile ---

  async getProfile() {
    return this.request("/mobile/profile")
  }

  // --- Legacy heartbeat ---
  // Presence is GPS/workday-led; this endpoint remains only for old app
  // versions and never represents an agent as live.

  async ping() {
    return this.request("/mobile/ping", { method: "POST" })
  }

  // --- Location ---

  async sendLocation(data: {
    latitude: number
    longitude: number
    accuracy?: number
    speed?: number
    heading?: number
    altitude?: number
    battery?: number
    /** Bind an offline/retried point to the exact active workday. */
    workdayId?: string
    /** Original device capture time, not delayed upload time. */
    recordedAt?: string
    /** Deterministic retry key so a retried point is not duplicated. */
    clientLocationId?: string
  }) {
    return this.request("/mobile/location", {
      method: "POST",
      body: JSON.stringify(data),
    })
  }

  /**
   * Share one foreground position by explicit user action. This deliberately
   * uses a separate method and server mode so it can never be mistaken for
   * field-agent background tracking.
   */
  async shareSelfLocation(data: {
    latitude: number
    longitude: number
    accuracy?: number
    speed?: number
    heading?: number
    altitude?: number
    battery?: number
  }) {
    return this.request("/mobile/location", {
      method: "POST",
      body: JSON.stringify({ ...data, mode: "SELF_SHARE" }),
    })
  }

  async getLocationHistory(date?: string, signal?: AbortSignal) {
    const qs = date ? `?date=${encodeURIComponent(date)}` : ""
    return this.request(`/mobile/location${qs}`, { signal })
  }

  async syncPush(operations: Array<{
    operationId: string
    entity: string
    op: "create" | "update"
    data: Record<string, unknown>
    clientTimestamp: number
  }>) {
    // `clientId` is observational only for legacy v1 push. Never use the
    // agent id here: an installation can legitimately change accounts. A
    // storage failure leaves the durable operation untouched and falls back to
    // the server's v1-compatible omitted field rather than inventing a new id.
    let clientId: string | null = null
    try {
      clientId = await getFieldDeviceId()
    } catch {}
    return this.request("/mobile/sync/push", {
      method: "POST",
      body: JSON.stringify({ ...(clientId ? { clientId } : {}), operations }),
    })
  }

  async syncPull(since?: string | null) {
    const query = new URLSearchParams({ entities: "routes,customers,visits,tasks,contacts", limit: "200" })
    if (since) query.set("since", since)
    return this.request(`/mobile/sync/pull?${query.toString()}`)
  }

  /**
   * Cohort-gated, read-only sync v2 routes pilot. Its opaque cursor is passed
   * through untouched; v1 remains the authoritative mutation path.
   */
  async syncV2Routes(cursor?: string | null, limit = 200) {
    const query = new URLSearchParams({ limit: String(Math.max(1, Math.min(500, Math.floor(limit)))) })
    if (cursor) query.set("cursor", cursor)
    return this.request(`/mobile/sync/routes?${query.toString()}`, {}, 20_000, 2)
  }

  async getManagerTeam(signal?: AbortSignal, includeInactive = false) {
    return this.request(`/mobile/manager/team${includeInactive ? "?includeInactive=1" : ""}`, { signal })
  }

  async getManagerLocations(signal?: AbortSignal) {
    return this.request("/mobile/manager/locations", { signal })
  }

  async getManagerPlanning(date?: string, signal?: AbortSignal) {
    const qs = date ? `?date=${encodeURIComponent(date)}` : ""
    return this.request(`/mobile/manager/planning${qs}`, { signal })
  }

  async getManagerPlanningRange(from: string, to: string, signal?: AbortSignal) {
    const query = new URLSearchParams({ from, to })
    return this.request(`/mobile/manager/planning?${query.toString()}`, { signal })
  }

  async getManagerApprovals(signal?: AbortSignal) {
    return this.request("/mobile/manager/approvals", { signal })
  }

  /**
   * Decide an HRM request (approve/reject). Hits the shared operations decision
   * endpoint, which accepts the mobile Bearer via withMtmRlsAuth and enforces a
   * non-AGENT actor server-side. A rejection requires a note.
   */
  async hrmDecision(id: string, decision: "APPROVED" | "REJECTED", note?: string) {
    return this.request(`/operations/hrm/${id}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision, ...(note ? { note } : {}) }),
    })
  }

  /**
   * Decide a route-change request (approve/reject). The decision endpoint
   * accepts the mobile Bearer via withMtmRlsAuth and gates to a MANAGER/
   * SUPERVISOR/ADMIN actor in scope; a rejection requires a comment.
   */
  async routeChangeDecision(id: string, decision: "APPROVED" | "REJECTED", comment?: string) {
    return this.request(`/route-change-requests/${id}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision, ...(comment ? { comment } : {}) }),
    })
  }

  /**
   * Decide a customer-create request (approve/reject). Same dual-principal
   * decision endpoint; approval materializes the customer server-side, a
   * rejection requires a comment.
   */
  async customerCreateDecision(id: string, decision: "APPROVED" | "REJECTED", comment?: string) {
    return this.request(`/customer-create-requests/${id}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision, ...(comment ? { comment } : {}) }),
    })
  }

  async contactChangeDecision(id: string, decision: "APPROVED" | "REJECTED", comment: string) {
    return this.request(`/contact-change-requests/${id}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision, comment }),
    })
  }

  // --- Routes ---

  async getRoutes(date?: string, signal?: AbortSignal) {
    const query = new URLSearchParams()
    if (date) query.set("date", date)
    if (this.agentId) query.set("agentId", this.agentId)
    const qs = query.toString()
    return this.request(`/routes${qs ? `?${qs}` : ""}`, { signal })
  }

  async getRoute(id: string, coords?: { latitude: number; longitude: number }, signal?: AbortSignal) {
    const qs = coords
      ? `?latitude=${coords.latitude}&longitude=${coords.longitude}`
      : ""
    return this.request(`/routes/${id}${qs}`, { signal })
  }

  /** Manager planning read: fetch one scoped agent's full routes and points. */
  async getRoutesForAgent(date: string, agentId: string, signal?: AbortSignal) {
    const query = new URLSearchParams({ date, agentId, limit: "200" })
    return this.request(`/routes?${query.toString()}`, { signal })
  }

  /** Create a real server-side route draft. Publishing is a separate action. */
  async createRouteDraft(data: {
    agentId: string
    date: string
    name?: string | null
    notes?: string | null
    points: Array<{ customerId: string; contactId?: string; plannedTime?: string | null }>
  }) {
    return this.request("/routes", {
      method: "POST",
      body: JSON.stringify({ ...data, status: "DRAFT" }),
    })
  }

  /** Update an existing draft without inventing a second route for that day. */
  async updateRouteDraft(id: string, data: {
    expectedVersion: number
    agentId?: string
    date?: string
    name?: string | null
    notes?: string | null
    points: Array<{ customerId: string; contactId?: string; plannedTime?: string | null }>
  }) {
    return this.request(`/routes/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    })
  }

  /** Publish a saved draft. The server remains authoritative for conflicts. */
  async publishRoute(id: string, expectedVersion: number, overrideReason?: string) {
    return this.request(`/routes/${id}/publish`, {
      method: "POST",
      body: JSON.stringify({ expectedVersion, ...(overrideReason ? { overrideReason } : {}) }),
    })
  }

  // --- Visits ---

  async checkIn(data: {
    customerId: string
    latitude?: number
    longitude?: number
    notes?: string
    // F-28: SUPERVISOR/MANAGER/ADMIN can bypass geofence by sending
    // force=true. Server validates the actor's role and returns 403 if
    // a non-privileged agent attempts the override.
    force?: boolean
  }) {
    return this.request("/visits", {
      method: "POST",
      body: JSON.stringify({ ...data, agentId: this.agentId }),
    })
  }

  async checkOut(visitId: string, data: {
    latitude?: number
    longitude?: number
    notes?: string
  }) {
    return this.request(`/visits/${visitId}`, {
      method: "PUT",
      body: JSON.stringify({ status: "CHECKED_OUT", ...data }),
    })
  }

  async getVisits(params?: { date?: string; limit?: number }) {
    const query = new URLSearchParams()
    if (params?.date) query.set("date", params.date)
    if (params?.limit) query.set("limit", String(params.limit))
    if (this.agentId) query.set("agentId", this.agentId)
    const qs = query.toString()
    return this.request(`/visits${qs ? `?${qs}` : ""}`)
  }

  // --- Tasks ---

  async getTasks(status?: string) {
    const query = new URLSearchParams()
    if (status) query.set("status", status)
    if (this.agentId) query.set("agentId", this.agentId)
    const qs = query.toString()
    return this.request(`/tasks${qs ? `?${qs}` : ""}`)
  }

  async updateTask(id: string, data: { status?: string; result?: string }) {
    return this.request(`/tasks/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    })
  }

  /**
   * Manager bulk reassignment: move a batch of tasks to another agent
   * (TEAM_DECIDE + scope gated). Returns { reassigned } — how many actually
   * moved after the server's scope filter.
   */
  async bulkReassignTasks(taskIds: string[], agentId: string) {
    return this.request(`/mobile/tasks/bulk-reassign`, {
      method: "POST",
      body: JSON.stringify({ taskIds, agentId }),
    })
  }

  /**
   * List the files/evidence attached to a task (read side). Scoped server-side
   * to the assignee's own task or a TEAM_READ manager's team.
   */
  async getTaskDocuments(taskId: string, signal?: AbortSignal) {
    return this.request(`/mobile/tasks/${taskId}/documents`, { signal })
  }

  /**
   * Manager task-metadata edit. Hits the mobile-only endpoint gated on
   * TEAM_DECIDE + agent scope server-side (not the org-scoped web PUT).
   * Only defined fields are sent; description can be cleared with null.
   */
  async updateTaskFields(
    id: string,
    fields: {
      title?: string
      description?: string | null
      priority?: string
      dueDate?: string | null
      recurrenceRule?: string | null
      recurrenceInterval?: number
    },
  ) {
    return this.request(`/mobile/tasks/${id}`, {
      method: "PUT",
      body: JSON.stringify(fields),
    })
  }

  /**
   * Manager task duplication. Creates a fresh PENDING copy server-side (same
   * TEAM_DECIDE + scope gate). Returns the new task in `data`.
   */
  async duplicateTask(id: string) {
    return this.request(`/mobile/tasks/${id}/duplicate`, { method: "POST" })
  }

  /**
   * Report execution progress (0..100) on the caller's own task. Scoped to the
   * assignee server-side (not TEAM_DECIDE); a non-owned task is a 404.
   */
  async updateTaskProgress(id: string, progress: number) {
    return this.request(`/mobile/tasks/${id}/progress`, {
      method: "PATCH",
      body: JSON.stringify({ progress }),
    })
  }

  /**
   * Manager review/return: send a completed task back to the assignee for
   * rework with a reason (TEAM_DECIDE + scope gated). The task reopens to
   * IN_PROGRESS server-side; a reason is required.
   */
  async returnTask(id: string, reason: string) {
    return this.request(`/mobile/tasks/${id}/return`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    })
  }

  // --- KPI ---

  /**
   * Personal KPI with server-owned formulas. `period` uses the server naming
   * (day|week|month) — services/kpi.ts translates the UI's "today" into "day".
   * The agent scope comes from the bearer token, so no agentId is passed.
   */
  async getKpi(period: "day" | "week" | "month", signal?: AbortSignal) {
    return this.request(`/mobile/kpi?period=${period}`, { signal })
  }

  // --- Photos ---

  async getPhotos() {
    const query = this.agentId ? `?agentId=${this.agentId}` : ""
    return this.request(`/photos${query}`)
  }

  // --- Customers ---

  async getCustomers() {
    return this.request("/customers")
  }

  // --- Organizations (field master data) ---

  async getOrganizations(
    params?: {
      search?: string
      page?: number
      limit?: number
      category?: string
      status?: string
      objectType?: string
      region?: string
      administrativeDistrict?: string
      locality?: string
      cityDistrict?: string
      specialization?: string
      organizationKind?: string
      territoryCode?: string
      managingManagerId?: string
      assignedAgentId?: string
      assignmentState?: "ASSIGNED" | "UNASSIGNED"
      sort?: "name" | "updatedAt" | "city" | "category" | "status"
      direction?: "asc" | "desc"
    },
    signal?: AbortSignal,
  ) {
    const query = new URLSearchParams()
    if (params?.search) query.set("search", params.search)
    if (params?.page) query.set("page", String(params.page))
    if (params?.limit) query.set("limit", String(params.limit))
    for (const key of [
      "category", "status", "objectType", "region", "administrativeDistrict",
      "locality", "cityDistrict", "specialization", "organizationKind",
      "territoryCode", "managingManagerId", "assignedAgentId", "assignmentState",
      "sort", "direction",
    ] as const) {
      if (params?.[key]) query.set(key, params[key] as string)
    }
    const qs = query.toString()
    return this.request(`/organizations${qs ? `?${qs}` : ""}`, { signal })
  }

  async getOrganization(id: string, signal?: AbortSignal) {
    return this.request(`/organizations/${id}`, { signal })
  }

  async getOrganizationFacets(signal?: AbortSignal) {
    return this.request("/organizations/facets", { signal })
  }

  async getOrganizationViews(signal?: AbortSignal) {
    return this.request("/organizations/views", { signal })
  }

  async createOrganizationView(data: {
    name: string
    filters: Record<string, unknown>
    columns: string[]
    isDefault?: boolean
  }) {
    return this.request("/organizations/views", { method: "POST", body: JSON.stringify(data) })
  }

  async deleteOrganizationView(id: string) {
    return this.request(`/organizations/views/${id}`, { method: "DELETE" })
  }

  async previewOrganizationAssignment(data: {
    organizationIds: string[]
    mode: "ASSIGN" | "UNASSIGN"
    targetAgentId?: string | null
    effectiveFrom: string
    reason: string
  }) {
    return this.request("/organization-assignments/preview", { method: "POST", body: JSON.stringify(data) })
  }

  async executeOrganizationAssignment(data: {
    organizationIds: string[]
    mode: "ASSIGN" | "UNASSIGN"
    targetAgentId?: string | null
    effectiveFrom: string
    reason: string
    previewToken: string
    idempotencyKey: string
  }) {
    return this.request("/organization-assignments", { method: "POST", body: JSON.stringify(data) })
  }

  async getContacts(
    params?: { search?: string; page?: number; limit?: number; ownerAgentId?: string },
    signal?: AbortSignal,
  ) {
    const query = new URLSearchParams()
    if (params?.search) query.set("search", params.search)
    if (params?.page) query.set("page", String(params.page))
    if (params?.limit) query.set("limit", String(params.limit))
    if (params?.ownerAgentId) query.set("ownerAgentId", params.ownerAgentId)
    const qs = query.toString()
    return this.request(`/contacts${qs ? `?${qs}` : ""}`, { signal })
  }

  async getContact(id: string, signal?: AbortSignal) {
    return this.request(`/contacts/${id}`, { signal })
  }

  async updateContact(id: string, fields: Record<string, unknown>) {
    return this.request(`/contacts/${id}`, { method: "PUT", body: JSON.stringify(fields) })
  }

  async submitContactChange(id: string, data: {
    idempotencyKey: string
    reason: string
    expectedContactUpdatedAt: string
    kind: "CONTACT_UPDATE" | "WORKPLACE_UPSERT" | "WORKPLACE_END" | "DUPLICATE_REPORT"
    payload: object
  }) {
    return this.request(`/contacts/${id}/change-requests`, { method: "POST", body: JSON.stringify(data) })
  }

  async upsertContactWorkplace(id: string, data: object) {
    return this.request(`/contacts/${id}/workplaces`, { method: "PUT", body: JSON.stringify(data) })
  }

  async endContactWorkplace(id: string, workplaceId: string) {
    return this.request(`/contacts/${id}/workplaces/${workplaceId}`, { method: "DELETE" })
  }

  async getDoctorScoringFormulas(signal?: AbortSignal) {
    return this.request("/doctor-scoring/formulas", { signal })
  }

  async createDoctorAssessment(contactId: string, data: object) {
    return this.request(`/contacts/${contactId}/assessments`, {
      method: "POST",
      body: JSON.stringify(data),
    })
  }

  async decideDoctorAssessment(id: string, decision: "VERIFIED" | "REJECTED", comment: string) {
    return this.request(`/doctor-assessments/${id}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision, comment }),
    })
  }

  async createBrandPotential(contactId: string, data: object) {
    return this.request(`/contacts/${contactId}/brand-potentials`, {
      method: "POST",
      body: JSON.stringify(data),
    })
  }

  async decideBrandPotential(id: string, decision: "VERIFIED" | "REJECTED", comment: string) {
    return this.request(`/field-potentials/${id}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision, comment }),
    })
  }

  async endBrandPotential(id: string, periodEnd: string, reason: string) {
    return this.request(`/field-potentials/${id}/end`, {
      method: "POST",
      body: JSON.stringify({ periodEnd, reason }),
    })
  }

  async previewContactTransfer(data: {
    contactIds: string[]
    sourceAgentId: string
    targetAgentId: string
    effectiveFrom: string
  }) {
    return this.request("/contact-transfers/preview", {
      method: "POST",
      body: JSON.stringify(data),
    })
  }

  async executeContactTransfer(data: {
    contactIds: string[]
    sourceAgentId: string
    targetAgentId: string
    effectiveFrom: string
    previewToken: string
    idempotencyKey: string
    reason: string
  }) {
    return this.request("/contact-transfers", {
      method: "POST",
      body: JSON.stringify(data),
    })
  }

  // --- Week / agenda ---

  async getWeek(start?: string, signal?: AbortSignal) {
    const qs = start ? `?start=${encodeURIComponent(start)}` : ""
    return this.request(`/mobile/week${qs}`, { signal })
  }

  /**
   * Optional, server-gated colleague calendar. Callers must not persist this
   * response: the tenant can withdraw visibility at any time.
   */
  async getTeamSchedule(from: string, to: string, signal?: AbortSignal) {
    const query = new URLSearchParams({ from, to })
    return this.request(`/mobile/team-schedule?${query.toString()}`, { signal })
  }

  // --- Visit workspace ---

  async getVisitWorkspace(id: string, signal?: AbortSignal) {
    return this.request(`/mobile/visits/${id}/workspace`, { signal })
  }

  // --- Orders ---

  // --- Alerts ---

  async getAlerts(params?: { resolved?: boolean }) {
    const query = new URLSearchParams()
    if (params?.resolved !== undefined) query.set("resolved", String(params.resolved))
    const qs = query.toString()
    return this.request(`/alerts${qs ? `?${qs}` : ""}`)
  }

  async resolveAlert(id: string) {
    return this.request(`/alerts/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ isResolved: true }),
    })
  }

  // --- Photo Upload ---

  async uploadPhoto(data: {
    filePath: string
    fileName?: string
    visitId?: string
    category?: string
    latitude?: number
    longitude?: number
  }) {
    if (!this.baseUrl) throw new Error("Server not configured")

    const formData = new FormData()
    formData.append("file", {
      uri: data.filePath.startsWith("file://") ? data.filePath : `file://${data.filePath}`,
      type: "image/jpeg",
      name: data.fileName || "photo.jpg",
    } as any)
    if (this.agentId) formData.append("agentId", this.agentId)
    if (data.visitId) formData.append("visitId", data.visitId)
    if (data.category) formData.append("category", data.category)
    if (data.latitude !== undefined) formData.append("latitude", String(data.latitude))
    if (data.longitude !== undefined) formData.append("longitude", String(data.longitude))

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      // Do NOT set Content-Type — fetch sets multipart boundary automatically
    }
    if (this.token) {
      headers["x-field-apk-version"] = ROUTE_FIELD_PROFILE.apkVersion
      try {
        headers["x-field-device-id"] = await getFieldDeviceId()
      } catch {}
    }

    const res = await fetch(`${this.baseUrl}/photos`, {
      method: "POST",
      headers,
      body: formData,
    })

    if (res.status === 401) {
      // Same token-gate as request(): uploadPhoto always runs mid-session
      // (token required for the Authorization header above), so hadToken
      // is always true here — but we guard consistently for correctness.
      const hadToken = !!this.token
      await this.logout()
      if (hadToken) {
        this._onUnauthorized?.(REVOKED_REASON)
      }
      throw new Error("SESSION_EXPIRED")
    }

    const responseData = await res.json()
    if (!res.ok) {
      const err = new Error(responseData.error || "Upload failed") as RetryableSyncError
      err.code = responseData.code
      err.status = res.status
      err.retryAfterMs = retryAfterMsFromHeader(res.headers?.get?.("Retry-After"))
      throw err
    }
    return responseData
  }

  /** Generic GET — used by stores that don't have a dedicated method yet. */
  async get(path: string) {
    return this.request(path)
  }

  /** Generic POST — used by stores that don't have a dedicated method yet. */
  async post(path: string, body: unknown) {
    return this.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  }
}

export const api = new ApiClient()
