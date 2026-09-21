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
