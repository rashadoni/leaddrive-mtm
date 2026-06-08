/**
 * useAuthStore — Zustand auth state-machine tests
 *
 * Coverage:
 *   - setServer        sets hasServer + domain + companyName
 *   - login success    isLoggedIn=true, agent populated
 *   - login failure    throws error, state unchanged
 *   - logout           clears agent, isLoggedIn=false
 *   - switchServer     wipes everything (full logout + server reset)
 *   - checkAuth paths:
 *       no server stored   → hasServer=false, isLoggedIn=false
 *       server + loggedIn  → isLoggedIn=true, agent hydrated
 *       server + not auth  → hasServer=true, isLoggedIn=false
 *       api.init throws    → all flags reset to false
 *
 * Note: jest.mock factory is hoisted above variable declarations, so mock
 * fns are defined inline. Access them via the imported `api` after mocking.
 */

// ── Mocks (defined inline so hoisting works) ──────────────────────────────────

jest.mock("../../src/services/api", () => ({
  api: {
    login: jest.fn(),
    logout: jest.fn(),
    fullLogout: jest.fn(),
    init: jest.fn(),
    getStoredServer: jest.fn(),
    isLoggedIn: jest.fn(),
    getStoredAgent: jest.fn(),
  },
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { api } from "../../src/services/api"
import { useAuthStore } from "../../src/store/auth"

// Typed helpers
const mockLogin = api.login as jest.Mock
const mockLogout = api.logout as jest.Mock
const mockFullLogout = api.fullLogout as jest.Mock
const mockInit = api.init as jest.Mock
const mockGetStoredServer = api.getStoredServer as jest.Mock
const mockIsLoggedIn = api.isLoggedIn as jest.Mock
const mockGetStoredAgent = api.getStoredAgent as jest.Mock

const SAMPLE_AGENT = {
  id: "ag-1",
  name: "Rauf Aliyev",
  email: "rauf@mars.az",
  role: "AGENT",
  organizationId: "org-1",
  organizationName: "Mars Overseas",
}

function resetStore() {
  useAuthStore.setState({
    isLoggedIn: false,
    isLoading: false,
    hasServer: false,
    serverDomain: "",
    companyName: "",
    agent: null,
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  resetStore()
  // Default: init succeeds silently
  mockInit.mockResolvedValue(undefined)
  mockLogout.mockResolvedValue(undefined)
  mockFullLogout.mockResolvedValue(undefined)
  // Explicit safe defaults for checkAuth-path mocks; each test overrides as needed.
  // Without these, a test that forgets to set them inherits a previous test's resolved value.
  mockGetStoredServer.mockResolvedValue(null)
  mockIsLoggedIn.mockResolvedValue(false)
  mockGetStoredAgent.mockResolvedValue(null)
})

// ─────────────────────────────────────────────────────────────────────────────
// setServer
// ─────────────────────────────────────────────────────────────────────────────

describe("useAuthStore — setServer", () => {
  it("sets hasServer, serverDomain, and companyName", () => {
    useAuthStore.getState().setServer("guven.leaddrivecrm.org", "Güvən LLC")
    const { hasServer, serverDomain, companyName } = useAuthStore.getState()
    expect(hasServer).toBe(true)
    expect(serverDomain).toBe("guven.leaddrivecrm.org")
    expect(companyName).toBe("Güvən LLC")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// login
// ─────────────────────────────────────────────────────────────────────────────

describe("useAuthStore — login", () => {
  it("sets isLoggedIn=true and populates agent on success", async () => {
    mockLogin.mockResolvedValue({ success: true, data: { agent: SAMPLE_AGENT } })
    await useAuthStore.getState().login("rauf@mars.az", "password")
    const { isLoggedIn, agent } = useAuthStore.getState()
    expect(isLoggedIn).toBe(true)
    expect(agent).toEqual(SAMPLE_AGENT)
  })

  it("throws and leaves isLoggedIn=false on api failure (success=false)", async () => {
    mockLogin.mockResolvedValue({ success: false, error: "Invalid credentials" })
    await expect(useAuthStore.getState().login("x@x.com", "bad")).rejects.toThrow(
      "Invalid credentials",
    )
    expect(useAuthStore.getState().isLoggedIn).toBe(false)
    expect(useAuthStore.getState().agent).toBeNull()
  })

  it("throws generic 'Login failed' when api returns success=false with no error field", async () => {
    mockLogin.mockResolvedValue({ success: false })
    await expect(useAuthStore.getState().login("x@x.com", "bad")).rejects.toThrow("Login failed")
  })

  it("re-throws if api.login itself throws (network error)", async () => {
    mockLogin.mockRejectedValue(new Error("SESSION_EXPIRED"))
    await expect(useAuthStore.getState().login("x@x.com", "bad")).rejects.toThrow("SESSION_EXPIRED")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// logout
// ─────────────────────────────────────────────────────────────────────────────

describe("useAuthStore — logout", () => {
  it("sets isLoggedIn=false and clears agent", async () => {
    useAuthStore.setState({ isLoggedIn: true, agent: SAMPLE_AGENT as any })
    await useAuthStore.getState().logout()
    expect(useAuthStore.getState().isLoggedIn).toBe(false)
    expect(useAuthStore.getState().agent).toBeNull()
    expect(mockLogout).toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// switchServer
// ─────────────────────────────────────────────────────────────────────────────

describe("useAuthStore — switchServer", () => {
  it("clears all auth + server state", async () => {
    useAuthStore.setState({
      isLoggedIn: true,
      hasServer: true,
      serverDomain: "guven.leaddrivecrm.org",
      companyName: "Güvən",
      agent: SAMPLE_AGENT as any,
    })
    await useAuthStore.getState().switchServer()
    const state = useAuthStore.getState()
    expect(state.isLoggedIn).toBe(false)
    expect(state.hasServer).toBe(false)
    expect(state.serverDomain).toBe("")
    expect(state.companyName).toBe("")
    expect(state.agent).toBeNull()
    expect(mockFullLogout).toHaveBeenCalled()
  })

  // FIX 3: switchServer must also clear revokedReason so the revoked banner
  // from tenant A doesn't carry over to tenant B's login screen
  it("clears revokedReason when switching server", async () => {
    useAuthStore.setState({
      isLoggedIn: false,
      hasServer: true,
      serverDomain: "guven.leaddrivecrm.org",
      companyName: "Güvən",
      agent: null,
      revokedReason: "REVOKED",
    })
    await useAuthStore.getState().switchServer()
    expect(useAuthStore.getState().revokedReason).toBeNull()
    expect(mockFullLogout).toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// checkAuth
// ─────────────────────────────────────────────────────────────────────────────

describe("useAuthStore — checkAuth", () => {
  it("sets hasServer=false when no server is stored", async () => {
    mockGetStoredServer.mockResolvedValue(null)
    await useAuthStore.getState().checkAuth()
    const { hasServer, isLoggedIn, isLoading } = useAuthStore.getState()
    expect(hasServer).toBe(false)
    expect(isLoggedIn).toBe(false)
    expect(isLoading).toBe(false)
  })

  it("sets isLoggedIn=true and hydrates agent when server + token exist", async () => {
    mockGetStoredServer.mockResolvedValue("guven.leaddrivecrm.org")
    mockIsLoggedIn.mockResolvedValue(true)
    mockGetStoredAgent.mockResolvedValue(SAMPLE_AGENT)
    await useAuthStore.getState().checkAuth()
    const { isLoggedIn, hasServer, serverDomain, companyName, agent, isLoading } =
      useAuthStore.getState()
    expect(isLoggedIn).toBe(true)
    expect(hasServer).toBe(true)
    expect(serverDomain).toBe("guven.leaddrivecrm.org")
    expect(companyName).toBe("Mars Overseas") // from agent.organizationName
    expect(agent).toEqual(SAMPLE_AGENT)
    expect(isLoading).toBe(false)
  })

  it("sets isLoggedIn=false, hasServer=true when server exists but not authenticated", async () => {
    mockGetStoredServer.mockResolvedValue("guven.leaddrivecrm.org")
    mockIsLoggedIn.mockResolvedValue(false)
    await useAuthStore.getState().checkAuth()
    const { isLoggedIn, hasServer, serverDomain, isLoading } = useAuthStore.getState()
    expect(isLoggedIn).toBe(false)
    expect(hasServer).toBe(true)
    expect(serverDomain).toBe("guven.leaddrivecrm.org")
    expect(isLoading).toBe(false)
  })

  it("uses serverDomain as companyName fallback when agent has no organizationName", async () => {
    mockGetStoredServer.mockResolvedValue("guven.leaddrivecrm.org")
    mockIsLoggedIn.mockResolvedValue(true)
    mockGetStoredAgent.mockResolvedValue({ ...SAMPLE_AGENT, organizationName: undefined })
    await useAuthStore.getState().checkAuth()
    // store does: agent?.organizationName || server
    expect(useAuthStore.getState().companyName).toBe("guven.leaddrivecrm.org")
  })

  it("resets to hasServer=false, isLoggedIn=false on unexpected error", async () => {
    mockInit.mockRejectedValue(new Error("AsyncStorage crash"))
    await useAuthStore.getState().checkAuth()
    const { isLoggedIn, hasServer, agent, isLoading } = useAuthStore.getState()
    expect(isLoggedIn).toBe(false)
    expect(hasServer).toBe(false)
    expect(agent).toBeNull()
    expect(isLoading).toBe(false)
  })
})
