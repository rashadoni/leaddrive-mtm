import AsyncStorage from "@react-native-async-storage/async-storage"
import { setAgentContext, clearAgentContext } from "./sentry"

const STORAGE_KEY_TOKEN = "@mtm_token"
const STORAGE_KEY_AGENT = "@mtm_agent"
const STORAGE_KEY_SERVER = "@mtm_server"
const STORAGE_KEY_CREDENTIALS = "@mtm_saved_login"

class ApiClient {
  private token: string | null = null
  private agentId: string | null = null
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
      const timeout = setTimeout(() => controller.abort(), 10000)

      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(timeout)

      const data = await res.json()
      if (data.success) {
        return { success: true, domain, name: data.data?.name }
      }
      return { success: false, domain, error: "Invalid server response" }
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

  async saveCredentials(email: string, password: string) {
    await AsyncStorage.setItem(STORAGE_KEY_CREDENTIALS, JSON.stringify({ email, password }))
  }

  async getSavedCredentials(): Promise<{ email: string; password: string } | null> {
    const raw = await AsyncStorage.getItem(STORAGE_KEY_CREDENTIALS)
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  async clearCredentials() {
    await AsyncStorage.removeItem(STORAGE_KEY_CREDENTIALS)
  }

  // --- Request ---

  private async request(path: string, options: RequestInit = {}) {
    if (!this.baseUrl) throw new Error("Server not configured")

    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    }

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`
    }

    const res = await fetch(url, { ...options, headers })
    const data = await res.json()

    if (res.status === 401) {
      await this.logout()
      throw new Error("SESSION_EXPIRED")
    }

    if (!res.ok) {
      throw new Error(data.error || `Request failed: ${res.status}`)
    }

    return data
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

  // --- Profile ---

  async getProfile() {
    return this.request("/mobile/profile")
  }

  // --- Heartbeat (keep agent online) ---

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
  }) {
    return this.request("/mobile/location", {
      method: "POST",
      body: JSON.stringify(data),
    })
  }

  async getLocationHistory() {
    return this.request("/mobile/location")
  }

  // --- Routes ---

  async getRoutes(date?: string) {
    const query = new URLSearchParams()
    if (date) query.set("date", date)
    if (this.agentId) query.set("agentId", this.agentId)
    const qs = query.toString()
    return this.request(`/routes${qs ? `?${qs}` : ""}`)
  }

  async getRoute(id: string, coords?: { latitude: number; longitude: number }) {
    const qs = coords
      ? `?latitude=${coords.latitude}&longitude=${coords.longitude}`
      : ""
    return this.request(`/routes/${id}${qs}`)
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

  // --- Photos ---

  async getPhotos() {
    const query = this.agentId ? `?agentId=${this.agentId}` : ""
    return this.request(`/photos${query}`)
  }

  // --- Customers ---

  async getCustomers() {
    return this.request("/customers")
  }

  // --- Orders ---

  async getOrders(params?: { status?: string }) {
    const query = new URLSearchParams()
    if (params?.status) query.set("status", params.status)
    if (this.agentId) query.set("agentId", this.agentId)
    const qs = query.toString()
    return this.request(`/orders${qs ? `?${qs}` : ""}`)
  }

  async createOrder(data: { customerId: string; items: any[]; notes?: string }) {
    return this.request("/orders", {
      method: "POST",
      body: JSON.stringify({ ...data, agentId: this.agentId }),
    })
  }

  // --- SKU Catalog ---

  async getSkuCategories() {
    return this.request("/skus/categories")
  }

  async getSkus(params?: { categoryId?: string; search?: string; isActive?: boolean }) {
    const query = new URLSearchParams()
    if (params?.categoryId) query.set("categoryId", params.categoryId)
    if (params?.search) query.set("search", params.search)
    if (params?.isActive !== undefined) query.set("isActive", String(params.isActive))
    const qs = query.toString()
    return this.request(`/skus${qs ? `?${qs}` : ""}`)
  }

  async createOrderWithSkuItems(data: {
    customerId: string
    items: { skuId: string; quantity: number; unitPrice: number }[]
    notes?: string
  }) {
    return this.request("/orders", {
      method: "POST",
      body: JSON.stringify({ ...data, agentId: this.agentId }),
    })
  }

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

    const res = await fetch(`${this.baseUrl}/photos`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        // Do NOT set Content-Type — fetch sets multipart boundary automatically
      },
      body: formData,
    })

    if (res.status === 401) {
      await this.logout()
      throw new Error("SESSION_EXPIRED")
    }

    const responseData = await res.json()
    if (!res.ok) throw new Error(responseData.error || "Upload failed")
    return responseData
  }

  // --- Dashboard ---

  async getDashboard() {
    return this.request("/dashboard")
  }

  // --- Settings ---

  async getSettings() {
    return this.request("/settings")
  }
}

export const api = new ApiClient()
