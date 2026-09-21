import fs from "fs"
import path from "path"
import { isTransportFailure } from "../../src/services/bootstrap"

const screen = fs.readFileSync(
  path.resolve(__dirname, "../../src/screens/auth/RouteFieldAccessScreen.android.tsx"),
  "utf8",
)
const store = fs.readFileSync(path.resolve(__dirname, "../../src/store/bootstrap.ts"), "utf8")
const resources = fs.readFileSync(path.resolve(__dirname, "../../src/i18n/mobile-resources.ts"), "utf8")

/**
 * 21 September, 01:32–01:35: production restarted mid-deploy and every
 * request came back 502. The phone told the agent their Route Field access
 * "could not be confirmed" and offered a sign-out button. Nothing about their
 * access had changed — the server was simply not there, and signing out
 * mid-shift is the one action that would actually have cost them something.
 */
describe("a server that does not answer is not a withdrawn entitlement", () => {
  it("reads a failure with no answer as transport, not as a verdict", () => {
    expect(isTransportFailure({ message: "Network request failed" })).toBe(true)
    expect(isTransportFailure({ message: "REQUEST_TIMEOUT" })).toBe(true)
    expect(isTransportFailure({ status: 502 })).toBe(true)
    expect(isTransportFailure({ status: 503 })).toBe(true)
    expect(isTransportFailure(null)).toBe(true)
  })

  it("keeps a real answer a real answer", () => {
    expect(isTransportFailure({ status: 403 })).toBe(false)
    expect(isTransportFailure({ status: 404 })).toBe(false)
    expect(isTransportFailure({ message: "SESSION_EXPIRED" })).toBe(false)
  })

  it("stores the two outcomes separately", () => {
    expect(store).toContain('isTransportFailure(error as { status?: number; message?: string }) ? "offline" : "unavailable"')
  })
})

describe("what the blocked screen does about it", () => {
  it("says the server is not answering instead of doubting the account", () => {
    expect(screen).toContain('if (access === "offline") return "offline"')
    expect(resources).toContain('offlineTitle: "Сервер не отвечает"')
    expect(resources).toContain('offlineTitle: "The server is not answering"')
    expect(resources).toContain('offlineTitle: "Server cavab vermir"')
  })

  it("does not offer signing out as a cure for an unreachable server", () => {
    expect(screen).toContain("{offline ? null : <Pressable")
  })

  it("retries on its own rather than waiting for a tap", () => {
    expect(screen).toContain("const OFFLINE_RETRY_SECONDS = 15")
    expect(screen).toContain("setInterval(() => { refresh().catch(() => {}) }, OFFLINE_RETRY_SECONDS * 1_000)")
  })
})

/**
 * The door stays shut either way: an unconfirmed tenant must not get field
 * tabs because the network was flaky.
 */
describe("the gate itself does not open", () => {
  it("never treats offline as access", () => {
    const service = fs.readFileSync(path.resolve(__dirname, "../../src/services/bootstrap.ts"), "utf8")
    expect(service).toContain('return access === "enabled" || access === "legacy"')
  })
})

/**
 * 21 September, owner's phone: the screen retried every fifteen seconds for
 * two minutes and the production server logged **zero** requests. Every
 * attempt died inside the app — `api.init()` had not filled `baseUrl`, so the
 * client threw `Server not configured` before dialling. "The app keeps
 * checking" was literally true and completely useless, and with the sign-out
 * button removed the agent had no way off the screen at all.
 */
describe("a retry that actually dials", () => {
  const store = fs.readFileSync(path.resolve(__dirname, "../../src/store/bootstrap.ts"), "utf8")
  const service = fs.readFileSync(path.resolve(__dirname, "../../src/services/bootstrap.ts"), "utf8")

  it("does not call a client failure a silent server", () => {
    expect(isTransportFailure({ message: "Server not configured" })).toBe(false)
    expect(service).toContain('export const NOT_CONFIGURED = "Server not configured"')
  })

  it("re-reads the stored server once before giving up", () => {
    expect(store).toContain("async function bootstrapWithStoredServer()")
    expect(store).toContain("await api.init()")
    expect(store).toContain("const res = await bootstrapWithStoredServer()")
  })

  it("cannot be wedged shut by one attempt that never settles", () => {
    expect(screen).toContain("const attemptRunning = useRef(false)")
    expect(screen).toContain("const ATTEMPT_TIMEOUT_MS = 12_000")
    expect(screen).toContain("new Promise((resolve) => setTimeout(resolve, ATTEMPT_TIMEOUT_MS))")
    expect(screen).not.toContain("if (refreshing) return")
  })

  it("tries at once rather than waiting out the first interval", () => {
    expect(screen).toContain("void refresh()\n    const timer = setInterval")
  })

  it("shows when it last tried, so the claim can be checked", () => {
    expect(screen).toContain('t("routeFieldAccess.offlineLastAttempt"')
  })

  /** Never trapped: after a minute of failures the way out returns, quietly. */
  it("gives the way out back after a minute of failures", () => {
    expect(screen).toContain("const ATTEMPTS_BEFORE_ESCAPE = 4")
    expect(screen).toContain("{offline && attempts < ATTEMPTS_BEFORE_ESCAPE ? null : <Pressable")
  })
})
