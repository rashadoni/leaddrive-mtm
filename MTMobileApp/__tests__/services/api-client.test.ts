/**
 * ApiClient — unit tests for pure / deterministic logic
 *
 * Coverage:
 *   - resolveDomain   (short-name expansion, pass-through)
 *   - protocol        (localhost/IP → http, domain → https)
 *   - slugForDomain   (F-35 security: tenant-scoped login, critical path)
 *   - canForceCheckIn / currentAgent getters (role gate + watermark identity)
 *   - init + isLoggedIn (AsyncStorage read path)
 *   - credentials     (save / get / clear round-trip)
 *   - request error handling (no baseUrl, 401 → SESSION_EXPIRED, 5xx)
 *   - login success + logout
 *
 * Native modules are mocked so this suite runs in Node (jest/RN preset).
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
    multiRemove: jest.fn(() => Promise.resolve()),
  },
}))

jest.mock("../../src/services/sentry", () => ({
  setAgentContext: jest.fn(),
  clearAgentContext: jest.fn(),
}))

jest.mock("../../src/services/field-device-id", () => ({
  getFieldDeviceId: jest.fn(() => Promise.resolve("rf-test-0000001-0000002-0000003")),
}))

// ── Imports ───────────────────────────────────────────────────────────────────

import AsyncStorage from "@react-native-async-storage/async-storage"
import { setAgentContext, clearAgentContext } from "../../src/services/sentry"
import { getFieldDeviceId } from "../../src/services/field-device-id"
// Import the singleton after mocks are in place
import { api } from "../../src/services/api"
import { managerApi } from "../../src/services/manager-api"

// Convenience: access private methods without TS complaints
const client = api as any

// Reset ApiClient internal state between tests
function resetClient() {
  client.token = null
  client.agentId = null
  client._agentRole = null
  client._agentName = null
  client._agentCode = null
  client.baseUrl = ""
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getFieldDeviceId as jest.Mock).mockResolvedValue("rf-test-0000001-0000002-0000003")
  resetClient()
})

// ─────────────────────────────────────────────────────────────────────────────
// resolveDomain
// ─────────────────────────────────────────────────────────────────────────────

describe("ApiClient — resolveDomain", () => {
  it("expands a short name to .leaddrivecrm.org", () => {
    expect(client.resolveDomain("app")).toBe("app.leaddrivecrm.org")
    expect(client.resolveDomain("guven")).toBe("guven.leaddrivecrm.org")
    expect(client.resolveDomain("afigroup")).toBe("afigroup.leaddrivecrm.org")
  })

  it("passes through if input already contains a dot", () => {
    expect(client.resolveDomain("fanum.tech")).toBe("fanum.tech")
    expect(client.resolveDomain("app.leaddrivecrm.org")).toBe("app.leaddrivecrm.org")
  })

  it("passes through if input contains a colon (IP:port or scheme)", () => {
    expect(client.resolveDomain("192.168.1.1:3000")).toBe("192.168.1.1:3000")
    expect(client.resolveDomain("localhost:8080")).toBe("localhost:8080")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// protocol
// ─────────────────────────────────────────────────────────────────────────────

describe("ApiClient — protocol", () => {
  it("returns http for localhost", () => {
    expect(client.protocol("localhost")).toBe("http")
    expect(client.protocol("localhost:3000")).toBe("http")
  })

  it("returns http for Android emulator address", () => {
    expect(client.protocol("10.0.2.2")).toBe("http")
    expect(client.protocol("10.0.2.2:3001")).toBe("http")
  })

  it("returns http for loopback IP", () => {
    expect(client.protocol("127.0.0.1")).toBe("http")
  })

  it("returns http for LAN/private IP addresses", () => {
    expect(client.protocol("192.168.1.100")).toBe("http")
    expect(client.protocol("192.168.0.1")).toBe("http")
  })

  it("returns https for public domains", () => {
    expect(client.protocol("app.leaddrivecrm.org")).toBe("https")
    expect(client.protocol("fanum.tech")).toBe("https")
    expect(client.protocol("guven.leaddrivecrm.org")).toBe("https")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// slugForDomain (F-35 — tenant-scoped login)
// ─────────────────────────────────────────────────────────────────────────────

describe("ApiClient — slugForDomain (F-35 security)", () => {
  it("maps app.leaddrivecrm.org → 'leaddrive' (main tenant)", () => {
    expect(client.slugForDomain("app.leaddrivecrm.org")).toBe("leaddrive")
  })

  it("maps any *.leaddrivecrm.org subdomain to its prefix", () => {
    expect(client.slugForDomain("guven.leaddrivecrm.org")).toBe("guven")
    expect(client.slugForDomain("afigroup.leaddrivecrm.org")).toBe("afigroup")
    expect(client.slugForDomain("mars-demo.leaddrivecrm.org")).toBe("mars-demo")
  })

  it("maps the hardcoded custom domain fanum.tech → 'fanum'", () => {
    expect(client.slugForDomain("fanum.tech")).toBe("fanum")
  })

  it("returns undefined for localhost (dev fallback path)", () => {
    expect(client.slugForDomain("localhost")).toBeUndefined()
    expect(client.slugForDomain("localhost:3001")).toBeUndefined()
  })

  it("returns undefined for Android emulator address", () => {
    expect(client.slugForDomain("10.0.2.2")).toBeUndefined()
    expect(client.slugForDomain("10.0.2.2:3001")).toBeUndefined()
  })

  it("returns undefined for IP addresses (no clean derivation)", () => {
    expect(client.slugForDomain("192.168.1.100")).toBeUndefined()
  })

  it("returns undefined for empty string", () => {
    expect(client.slugForDomain("")).toBeUndefined()
  })

  it("strips port before matching — domain:port resolves correctly", () => {
    expect(client.slugForDomain("guven.leaddrivecrm.org:443")).toBe("guven")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Role gates
// ─────────────────────────────────────────────────────────────────────────────

describe("ApiClient — canForceCheckIn (F-28 geofence override)", () => {
  it("returns true for ADMIN", () => {
    client._agentRole = "ADMIN"
    expect(api.canForceCheckIn).toBe(true)
  })

  it("returns true for MANAGER", () => {
    client._agentRole = "MANAGER"
    expect(api.canForceCheckIn).toBe(true)
  })

  it("returns true for SUPERVISOR", () => {
    client._agentRole = "SUPERVISOR"
    expect(api.canForceCheckIn).toBe(true)
  })

  it("returns false for AGENT", () => {
    client._agentRole = "AGENT"
    expect(api.canForceCheckIn).toBe(false)
  })

  it("returns false when role is null (not authenticated)", () => {
    client._agentRole = null
    expect(api.canForceCheckIn).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// currentAgent
// ─────────────────────────────────────────────────────────────────────────────

describe("ApiClient — currentAgent (M1-2 photo watermark identity)", () => {
  it("returns null when not authenticated", () => {
    expect(api.currentAgent).toBeNull()
  })

  it("returns agent object with explicit code when available", () => {
    client.agentId = "agent-abc-123"
    client._agentName = "Rauf Aliyev"
    client._agentCode = "RA042"
    client._agentRole = "AGENT"
    expect(api.currentAgent).toEqual({
      id: "agent-abc-123",
      name: "Rauf Aliyev",
      code: "RA042",
      role: "AGENT",
    })
  })

  it("falls back to last 6 chars of agentId when code is null", () => {
    client.agentId = "abcdef123456"
    client._agentName = "Test Agent"
    client._agentCode = null
    const agent = api.currentAgent!
    expect(agent.code).toBe("123456")
  })

  it("uppercases the fallback code", () => {
    client.agentId = "agent-xyzabc"
    client._agentName = "Test"
    client._agentCode = null
    const agent = api.currentAgent!
    expect(agent.code).toBe("XYZABC")
  })

  it("uses 'Unknown' when name is null", () => {
    client.agentId = "agent-1"
    client._agentName = null
    client._agentCode = "CODE01"
    expect(api.currentAgent!.name).toBe("Unknown")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// init + isLoggedIn
// ─────────────────────────────────────────────────────────────────────────────

describe("ApiClient — isLoggedIn", () => {
  it("returns false when baseUrl is empty", async () => {
    client.baseUrl = ""
    client.token = "some-token"
    expect(await api.isLoggedIn()).toBe(false)
  })

  it("returns false when no token in memory or AsyncStorage", async () => {
    client.baseUrl = "https://app.leaddrivecrm.org/api/v1/mtm"
    client.token = null
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null)
    expect(await api.isLoggedIn()).toBe(false)
  })

  it("returns true when token is in memory", async () => {
    client.baseUrl = "https://app.leaddrivecrm.org/api/v1/mtm"
    client.token = "valid-jwt"
    expect(await api.isLoggedIn()).toBe(true)
  })

  it("reads token from AsyncStorage when not in memory", async () => {
    client.baseUrl = "https://app.leaddrivecrm.org/api/v1/mtm"
    client.token = null
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce("stored-token")
    expect(await api.isLoggedIn()).toBe(true)
    expect(client.token).toBe("stored-token")
  })
})

describe("ApiClient — init", () => {
  it("sets baseUrl from stored server", async () => {
    ;(AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
      if (key === "@mtm_server") return Promise.resolve("guven.leaddrivecrm.org")
      if (key === "@mtm_token") return Promise.resolve("tok-123")
      return Promise.resolve(null)
    })
    await api.init()
    expect(client.baseUrl).toBe("https://guven.leaddrivecrm.org/api/v1/mtm")
    expect(client.token).toBe("tok-123")
  })

  it("parses stored agent and populates cached fields", async () => {
    const agent = { id: "ag-1", role: "AGENT", name: "Rauf", code: "RA1" }
    ;(AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
      if (key === "@mtm_agent") return Promise.resolve(JSON.stringify(agent))
      return Promise.resolve(null)
    })
    await api.init()
    expect(client.agentId).toBe("ag-1")
    expect(client._agentRole).toBe("AGENT")
    expect(client._agentName).toBe("Rauf")
    expect(client._agentCode).toBe("RA1")
  })

  it("sanitizes legacy saved passwords even when login is not opened", async () => {
    ;(AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
      if (key === "@mtm_saved_login") {
        return Promise.resolve(JSON.stringify({ email: "AGENT@EXAMPLE.COM", password: "legacy-secret" }))
      }
      return Promise.resolve(null)
    })
    await api.init()
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      "@mtm_saved_login",
      JSON.stringify({ email: "agent@example.com" }),
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Credentials
// ─────────────────────────────────────────────────────────────────────────────

describe("ApiClient — credentials", () => {
  it("stores only a normalized email and never a password", async () => {
    ;(AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined)
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(
      JSON.stringify({ email: "rauf@mars.az" }),
    )
    await api.saveCredentials(" Rauf@Mars.AZ ")
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      "@mtm_saved_login",
      JSON.stringify({ email: "rauf@mars.az" }),
    )
    const creds = await api.getSavedCredentials()
    expect(creds).toEqual({ email: "rauf@mars.az" })
  })

  it("removes a legacy plaintext password while retaining the email", async () => {
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(
      JSON.stringify({ email: "Rauf@Mars.AZ", password: "must-not-remain" }),
    )
    await expect(api.getSavedCredentials()).resolves.toEqual({ email: "rauf@mars.az" })
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      "@mtm_saved_login",
      JSON.stringify({ email: "rauf@mars.az" }),
    )
  })

  it("deletes malformed saved-login data", async () => {
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce("not-json")
    await expect(api.getSavedCredentials()).resolves.toBeNull()
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("@mtm_saved_login")
  })

  it("getSavedCredentials returns null when nothing stored", async () => {
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null)
    expect(await api.getSavedCredentials()).toBeNull()
  })

  it("clearCredentials removes the key", async () => {
    await api.clearCredentials()
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("@mtm_saved_login")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// request — error handling
// ─────────────────────────────────────────────────────────────────────────────

describe("ApiClient — request error handling", () => {
  it("throws 'Server not configured' when baseUrl is empty", async () => {
    client.baseUrl = ""
    await expect(client.request("/routes")).rejects.toThrow("Server not configured")
  })

  it("throws SESSION_EXPIRED on 401 and calls logout", async () => {
    client.baseUrl = "https://app.leaddrivecrm.org/api/v1/mtm"
    client.token = "expired-token"
    ;(global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      status: 401,
      ok: false,
      json: async () => ({ error: "Unauthorized" }),
    })
    await expect(client.request("/routes")).rejects.toThrow("SESSION_EXPIRED")
    // Token should be cleared after 401
    expect(client.token).toBeNull()
  })

  // FIX 1: login-time 401 (no token present) must NOT fire the revoked handler
  it("401 with NO token set does NOT call the unauthorized handler (login wrong-password path)", async () => {
    client.baseUrl = "https://app.leaddrivecrm.org/api/v1/mtm"
    client.token = null // simulates the login request — no session token yet
    const handler = jest.fn()
    client._onUnauthorized = handler
    ;(global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      status: 401,
      ok: false,
      json: async () => ({ error: "Invalid credentials" }),
    })
    await expect(client.request("/mobile/auth")).rejects.toThrow("SESSION_EXPIRED")
    // Revoked banner must NOT show on a login-time 401
    expect(handler).not.toHaveBeenCalled()
  })

  // FIX 1: mid-session 401 (token present) MUST fire the revoked handler
  it("401 WITH a token set calls the unauthorized handler (mid-session revocation)", async () => {
    client.baseUrl = "https://app.leaddrivecrm.org/api/v1/mtm"
    client.token = "active-jwt" // simulates a logged-in session
    const handler = jest.fn()
    client._onUnauthorized = handler
    ;(global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      status: 401,
      ok: false,
      json: async () => ({ error: "Unauthorized" }),
    })
    await expect(client.request("/routes")).rejects.toThrow("SESSION_EXPIRED")
    expect(handler).toHaveBeenCalledWith("REVOKED")
  })

  it("throws the server error message on non-ok response", async () => {
    client.baseUrl = "https://app.leaddrivecrm.org/api/v1/mtm"
    ;(global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      status: 500,
      ok: false,
      json: async () => ({ error: "DB is down" }),
    })
    await expect(client.request("/routes")).rejects.toThrow("DB is down")
  })

  it("attaches a bounded Retry-After hint to retryable API errors", async () => {
    client.baseUrl = "https://app.leaddrivecrm.org/api/v1/mtm"
    ;(global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      status: 503,
      ok: false,
      headers: { get: (name: string) => name === "Retry-After" ? "5" : null },
      json: async () => ({ error: "temporarily unavailable", code: "MOBILE_SYNC_UNAVAILABLE" }),
    })

    try {
      await client.request("/mobile/sync/pull")
      throw new Error("expected request to fail")
    } catch (error) {
      expect(error).toMatchObject({
        message: "temporarily unavailable",
        status: 503,
        code: "MOBILE_SYNC_UNAVAILABLE",
        retryAfterMs: 5_000,
      })
    }
  })

  it("returns parsed JSON on success", async () => {
    client.baseUrl = "https://app.leaddrivecrm.org/api/v1/mtm"
    client.token = "valid-token"
    ;(global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ success: true, data: { routes: [] } }),
    })
    const result = await client.request("/routes")
    expect(result.success).toBe(true)
  })

  it("attaches Authorization header when token is set", async () => {
    client.baseUrl = "https://app.leaddrivecrm.org/api/v1/mtm"
    client.token = "bearer-abc"
    const mockFetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ success: true }),
    })
    ;(global.fetch as jest.Mock) = mockFetch
    await client.request("/ping")
    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.headers["Authorization"]).toBe("Bearer bearer-abc")
    expect(opts.headers["x-field-device-id"]).toBe("rf-test-0000001-0000002-0000003")
    expect(opts.headers["x-field-apk-version"]).toBe("3.0.0+38")
  })
})

describe("ApiClient — Route Field device identity", () => {
  it("uses the opaque installation id for v1 clientId, never the agent id", async () => {
    client.baseUrl = "https://app.leaddrivecrm.org/api/v1/mtm"
    client.token = "bearer-abc"
    client.agentId = "agent-private-id"
    const mockFetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ success: true, results: [] }),
    })
    ;(global.fetch as jest.Mock) = mockFetch

    await api.syncPush([{
      operationId: "op-1",
      entity: "visits",
      op: "create",
      data: {},
      clientTimestamp: 1,
    }])

    const [, options] = mockFetch.mock.calls[0]
    expect(JSON.parse(options.body)).toEqual(expect.objectContaining({
      clientId: "rf-test-0000001-0000002-0000003",
    }))
    expect(JSON.parse(options.body).clientId).not.toContain("agent-private-id")
  })

  it("keeps v1 push available if the non-auth device storage is temporarily unavailable", async () => {
    client.baseUrl = "https://app.leaddrivecrm.org/api/v1/mtm"
    client.token = "bearer-abc"
    client.agentId = "agent-private-id"
    ;(getFieldDeviceId as jest.Mock).mockRejectedValue(new Error("storage unavailable"))
    const mockFetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ success: true, results: [] }),
    })
    ;(global.fetch as jest.Mock) = mockFetch

    await api.syncPush([{
      operationId: "op-2",
      entity: "visits",
      op: "create",
      data: {},
      clientTimestamp: 1,
    }])

    const [, options] = mockFetch.mock.calls[0]
    expect(JSON.parse(options.body).clientId).toBeUndefined()
    expect(options.headers["x-field-device-id"]).toBeUndefined()
    expect(options.headers["x-field-apk-version"]).toBe("3.0.0+38")
  })
})

describe("ApiClient — Route Field sync v2 transport", () => {
  it("uses the additive v2 base and forwards an opaque cursor without deriving it", async () => {
    client.baseUrl = "https://app.leaddrivecrm.org/api/v1/mtm"
    client.token = "bearer-abc"
    const mockFetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ success: true, protocolVersion: 2, stream: "routes" }),
    })
    ;(global.fetch as jest.Mock) = mockFetch

    await api.syncV2Routes("opaque-cursor-v1:never-decoded", 77)

    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe("https://app.leaddrivecrm.org/api/v2/mtm/mobile/sync/routes?limit=77&cursor=opaque-cursor-v1%3Anever-decoded")
    expect(options.headers).toMatchObject({
      Authorization: "Bearer bearer-abc",
      "x-field-device-id": "rf-test-0000001-0000002-0000003",
      "x-field-apk-version": "3.0.0+38",
    })
  })

  it("keeps the bounded 413 page-size hint for the stream-local retry adapter", async () => {
    client.baseUrl = "https://app.leaddrivecrm.org/api/v1/mtm"
    const mockFetch = jest.fn().mockResolvedValue({
      status: 413,
      ok: false,
      headers: { get: () => null },
      json: async () => ({
        error: "Route sync page is too large",
        code: "MOBILE_SYNC_V2_PAYLOAD_TOO_LARGE",
        recommendedPageSize: 50,
      }),
    })
    ;(global.fetch as jest.Mock) = mockFetch

    await expect(api.syncV2Routes(null, 200)).rejects.toMatchObject({
      message: "Route sync page is too large",
      status: 413,
      code: "MOBILE_SYNC_V2_PAYLOAD_TOO_LARGE",
      recommendedPageSize: 50,
    })
  })
})

describe("managerApi — explicit self-location share", () => {
  it("posts a one-shot position with the SELF_SHARE mode", async () => {
    client.baseUrl = "https://app.leaddrivecrm.org/api/v1/mtm"
    client.token = "valid-token"
    const mockFetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ success: true }),
    })
    ;(global.fetch as jest.Mock) = mockFetch

    await managerApi.shareSelfLocation({ latitude: 40.4093, longitude: 49.8671, accuracy: 12 })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe("https://app.leaddrivecrm.org/api/v1/mtm/mobile/location")
    expect(options.method).toBe("POST")
    expect(JSON.parse(options.body)).toEqual({
      latitude: 40.4093,
      longitude: 49.8671,
      accuracy: 12,
      mode: "SELF_SHARE",
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// login / logout
// ─────────────────────────────────────────────────────────────────────────────

describe("ApiClient — login", () => {
  beforeEach(() => {
    client.baseUrl = "https://app.leaddrivecrm.org/api/v1/mtm"
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      "app.leaddrivecrm.org",
    )
  })

  it("stores token and agent fields on success", async () => {
    const agent = { id: "ag-1", role: "AGENT", name: "Rauf", code: "RA1", organizationId: "org-1" }
    ;(global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ success: true, data: { token: "tok-xyz", agent } }),
    })
    await api.login("rauf@mars.az", "pass")
    expect(client.token).toBe("tok-xyz")
    expect(client.agentId).toBe("ag-1")
    expect(client._agentRole).toBe("AGENT")
    expect(client._agentName).toBe("Rauf")
    expect(setAgentContext).toHaveBeenCalledWith("ag-1", "org-1")
  })

  it("returns data without throwing on server-side auth failure", async () => {
    ;(global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ success: false, error: "Invalid credentials" }),
    })
    const result = await api.login("bad@user.com", "wrong")
    expect(result.success).toBe(false)
    expect(client.token).toBeNull()
  })
})

describe("ApiClient — logout", () => {
  it("clears token, agentId and role from memory", async () => {
    client.token = "tok"
    client.agentId = "ag-1"
    client._agentRole = "AGENT"
    await api.logout()
    expect(client.token).toBeNull()
    expect(client.agentId).toBeNull()
    expect(client._agentRole).toBeNull()
    expect(clearAgentContext).toHaveBeenCalled()
    expect(AsyncStorage.multiRemove).toHaveBeenCalledWith(["@mtm_token", "@mtm_agent"])
  })
})

describe("ApiClient — fullLogout", () => {
  it("clears token + server + credentials", async () => {
    client.token = "tok"
    client.baseUrl = "https://app.leaddrivecrm.org/api/v1/mtm"
    await api.fullLogout()
    expect(client.token).toBeNull()
    expect(client.baseUrl).toBe("")
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("@mtm_server")
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("@mtm_saved_login")
  })

  it("hrmDecision posts to the operations decision endpoint with decision + note", async () => {
    client.baseUrl = "https://app.leaddrivecrm.org/api/v1/mtm"
    client.token = "jwt"
    const fetchMock = jest.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ success: true }) })
    ;(global.fetch as jest.Mock) = fetchMock
    await managerApi.hrmDecision("hrm-1", "REJECTED", "not enough cover")
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe("https://app.leaddrivecrm.org/api/v1/mtm/operations/hrm/hrm-1/decision")
    expect(opts.method).toBe("POST")
    expect(JSON.parse(opts.body)).toEqual({ decision: "REJECTED", note: "not enough cover" })
  })

  it("hrmDecision omits the note when not provided", async () => {
    client.baseUrl = "https://app.leaddrivecrm.org/api/v1/mtm"
    client.token = "jwt"
    const fetchMock = jest.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ success: true }) })
    ;(global.fetch as jest.Mock) = fetchMock
    await managerApi.hrmDecision("hrm-2", "APPROVED")
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ decision: "APPROVED" })
  })

  it("routeChangeDecision posts to the route-change decision endpoint with decision + comment", async () => {
    client.baseUrl = "https://app.leaddrivecrm.org/api/v1/mtm"
    client.token = "jwt"
    const fetchMock = jest.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ success: true }) })
    ;(global.fetch as jest.Mock) = fetchMock
    await managerApi.routeChangeDecision("rc-1", "REJECTED", "out of territory")
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe("https://app.leaddrivecrm.org/api/v1/mtm/route-change-requests/rc-1/decision")
    expect(opts.method).toBe("POST")
    expect(JSON.parse(opts.body)).toEqual({ decision: "REJECTED", comment: "out of territory" })
  })

  it("routeChangeDecision omits the comment when not provided", async () => {
    client.baseUrl = "https://app.leaddrivecrm.org/api/v1/mtm"
    client.token = "jwt"
    const fetchMock = jest.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ success: true }) })
    ;(global.fetch as jest.Mock) = fetchMock
    await managerApi.routeChangeDecision("rc-2", "APPROVED")
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ decision: "APPROVED" })
  })

  it("customerCreateDecision posts to the customer-create decision endpoint with decision + comment", async () => {
    client.baseUrl = "https://app.leaddrivecrm.org/api/v1/mtm"
    client.token = "jwt"
    const fetchMock = jest.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ success: true }) })
    ;(global.fetch as jest.Mock) = fetchMock
    await managerApi.customerCreateDecision("cc-1", "REJECTED", "duplicate")
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe("https://app.leaddrivecrm.org/api/v1/mtm/customer-create-requests/cc-1/decision")
    expect(opts.method).toBe("POST")
    expect(JSON.parse(opts.body)).toEqual({ decision: "REJECTED", comment: "duplicate" })
  })

  it("customerCreateDecision omits the comment when not provided", async () => {
    client.baseUrl = "https://app.leaddrivecrm.org/api/v1/mtm"
    client.token = "jwt"
    const fetchMock = jest.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ success: true }) })
    ;(global.fetch as jest.Mock) = fetchMock
    await managerApi.customerCreateDecision("cc-2", "APPROVED")
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ decision: "APPROVED" })
  })

  it("updateTaskFields PUTs to the mobile task endpoint with the given fields", async () => {
    client.baseUrl = "https://app.leaddrivecrm.org/api/v1/mtm"
    client.token = "jwt"
    const fetchMock = jest.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ success: true }) })
    ;(global.fetch as jest.Mock) = fetchMock
    await managerApi.updateTaskFields("task-1", { title: "New", description: "d", priority: "HIGH" })
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe("https://app.leaddrivecrm.org/api/v1/mtm/mobile/tasks/task-1")
    expect(opts.method).toBe("PUT")
    expect(JSON.parse(opts.body)).toEqual({ title: "New", description: "d", priority: "HIGH" })
  })

  it("updateTaskFields forwards an explicit null description (clear)", async () => {
    client.baseUrl = "https://app.leaddrivecrm.org/api/v1/mtm"
    client.token = "jwt"
    const fetchMock = jest.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ success: true }) })
    ;(global.fetch as jest.Mock) = fetchMock
    await managerApi.updateTaskFields("task-2", { description: null })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ description: null })
  })

  it("updateTaskFields forwards recurrence rule + interval", async () => {
    client.baseUrl = "https://app.leaddrivecrm.org/api/v1/mtm"
    client.token = "jwt"
    const fetchMock = jest.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ success: true }) })
    ;(global.fetch as jest.Mock) = fetchMock
    await managerApi.updateTaskFields("task-3", { recurrenceRule: "WEEKLY", recurrenceInterval: 2 })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ recurrenceRule: "WEEKLY", recurrenceInterval: 2 })
  })

  it("duplicateTask POSTs to the duplicate endpoint", async () => {
    client.baseUrl = "https://app.leaddrivecrm.org/api/v1/mtm"
    client.token = "jwt"
    const fetchMock = jest.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ success: true }) })
    ;(global.fetch as jest.Mock) = fetchMock
    await managerApi.duplicateTask("task-9")
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe("https://app.leaddrivecrm.org/api/v1/mtm/mobile/tasks/task-9/duplicate")
    expect(opts.method).toBe("POST")
  })

  it("updateTaskProgress PATCHes the progress endpoint", async () => {
    client.baseUrl = "https://app.leaddrivecrm.org/api/v1/mtm"
    client.token = "jwt"
    const fetchMock = jest.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ success: true }) })
    ;(global.fetch as jest.Mock) = fetchMock
    await client.updateTaskProgress("task-5", 60)
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe("https://app.leaddrivecrm.org/api/v1/mtm/mobile/tasks/task-5/progress")
    expect(opts.method).toBe("PATCH")
    expect(JSON.parse(opts.body)).toEqual({ progress: 60 })
  })

  it("returnTask POSTs the reason to the return endpoint", async () => {
    client.baseUrl = "https://app.leaddrivecrm.org/api/v1/mtm"
    client.token = "jwt"
    const fetchMock = jest.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ success: true }) })
    ;(global.fetch as jest.Mock) = fetchMock
    await managerApi.returnTask("task-7", "photos missing")
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe("https://app.leaddrivecrm.org/api/v1/mtm/mobile/tasks/task-7/return")
    expect(opts.method).toBe("POST")
    expect(JSON.parse(opts.body)).toEqual({ reason: "photos missing" })
  })

  it("bulkReassignTasks POSTs the ids + agent to the bulk endpoint", async () => {
    client.baseUrl = "https://app.leaddrivecrm.org/api/v1/mtm"
    client.token = "jwt"
    const fetchMock = jest.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ success: true }) })
    ;(global.fetch as jest.Mock) = fetchMock
    await managerApi.bulkReassignTasks(["t1", "t2"], "agent-9")
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe("https://app.leaddrivecrm.org/api/v1/mtm/mobile/tasks/bulk-reassign")
    expect(opts.method).toBe("POST")
    expect(JSON.parse(opts.body)).toEqual({ taskIds: ["t1", "t2"], agentId: "agent-9" })
  })

  it("getTaskDocuments GETs the task documents endpoint", async () => {
    client.baseUrl = "https://app.leaddrivecrm.org/api/v1/mtm"
    client.token = "jwt"
    const fetchMock = jest.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ success: true, data: { documents: [] } }) })
    ;(global.fetch as jest.Mock) = fetchMock
    await client.getTaskDocuments("task-4")
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe("https://app.leaddrivecrm.org/api/v1/mtm/mobile/tasks/task-4/documents")
    expect(opts.method ?? "GET").toBe("GET")
  })
})
