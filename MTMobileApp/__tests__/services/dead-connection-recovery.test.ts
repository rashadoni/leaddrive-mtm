/**
 * 7 October 2026, owner's phone. The access screen said «Server cavab vermir»
 * and retried every fifteen seconds for over twenty minutes. The production
 * server logged no request from the app in that time; the same phone, on the
 * same Wi-Fi, got an answer from the same server in half a second from its
 * shell. Two requests were waiting inside the app's HTTP client on a
 * connection nothing came back from, and every retry joined them there.
 * Stopping the app and starting it again cured it within a second.
 *
 * The client cannot tell a dead connection from a slow one. These tests hold
 * the app to what it can do about it: count the silence, and have the
 * connection closed instead of reused.
 */

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

import fs from "fs"
import path from "path"
import { NativeModules } from "react-native"
import { api } from "../../src/services/api"
import {
  dropIdleConnections,
  noteAnswered,
  noteUnanswered,
  redial,
  resetConnectionHealthForTests,
} from "../../src/services/connection-health"

const client = api as any
const dropConnections = jest.fn()

/** A server that takes the request and never says anything: no answer, no error. */
function silent(init?: { signal?: AbortSignal }): Promise<never> {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => {
      const error = new Error("Aborted")
      error.name = "AbortError"
      reject(error)
    })
  })
}

const answered = (status: number, body: unknown) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } })

beforeEach(() => {
  jest.useFakeTimers()
  dropConnections.mockReset()
  ;(NativeModules as Record<string, unknown>).FieldNetwork = { dropConnections }
  resetConnectionHealthForTests()
  client.token = null
  client.sessionValidation = null
  client._onUnauthorized = null
  client.baseUrl = "https://app.leaddrivecrm.org/api/v1/mtm"
})

afterEach(() => {
  jest.useRealTimers()
  delete (NativeModules as Record<string, unknown>).FieldNetwork
})

describe("counting the silence", () => {
  it("one unanswered request drops only the connections nobody is using", () => {
    expect(noteUnanswered("no answer in 20 s")).toBe("idle")
    expect(dropConnections.mock.calls).toEqual([[false, "no answer in 20 s"]])
  })

  it("a second one in a row closes every connection, busy ones included", () => {
    noteUnanswered("first")
    expect(noteUnanswered("second")).toBe("all")
    expect(dropConnections.mock.calls).toEqual([[false, "first"], [true, "second"]])
  })

  it("an answer in between means the network is slow, not dead: the count starts again", () => {
    noteUnanswered("first")
    noteAnswered()
    expect(noteUnanswered("second")).toBe("idle")
    expect(dropConnections.mock.calls.map(([includeBusy]) => includeBusy)).toEqual([false, false])
  })

  it("after closing everything it does not keep closing on every later timeout", () => {
    noteUnanswered("first")
    noteUnanswered("second")
    expect(noteUnanswered("third")).toBe("idle")
  })

  it("can be told to dial again at once, and to drop the unused ones on return to the screen", () => {
    redial("access check got no answer")
    dropIdleConnections("app returned to the screen")
    expect(dropConnections.mock.calls).toEqual([
      [true, "access check got no answer"],
      [false, "app returned to the screen"],
    ])
  })

  it("does nothing, quietly, where the native side is missing or throws", () => {
    delete (NativeModules as Record<string, unknown>).FieldNetwork
    expect(() => noteUnanswered("no module")).not.toThrow()
    ;(NativeModules as Record<string, unknown>).FieldNetwork = {
      dropConnections: () => { throw new Error("bridge is gone") },
    }
    expect(() => redial("throws")).not.toThrow()
  })
})

describe("a request the server never answers", () => {
  it("ends at its deadline and has the unused connections dropped", async () => {
    ;(global.fetch as unknown) = jest.fn((_url: string, init?: { signal?: AbortSignal }) => silent(init))

    const outcome = expect(client.request("/mobile/kpi?period=day")).rejects.toThrow("REQUEST_TIMEOUT")
    await jest.advanceTimersByTimeAsync(20_000)
    await outcome

    expect(dropConnections.mock.calls).toEqual([[false, "no answer in 20 s"]])
  })

  it("twice in a row has every connection closed, so the third request dials again", async () => {
    ;(global.fetch as unknown) = jest.fn((_url: string, init?: { signal?: AbortSignal }) => silent(init))

    const first = expect(client.request("/mobile/kpi?period=day")).rejects.toThrow("REQUEST_TIMEOUT")
    await jest.advanceTimersByTimeAsync(20_000)
    await first
    const second = expect(client.request("/mobile/messages?limit=50")).rejects.toThrow("REQUEST_TIMEOUT")
    await jest.advanceTimersByTimeAsync(20_000)
    await second

    expect(dropConnections.mock.calls.map(([includeBusy]) => includeBusy)).toEqual([false, true])
  })

  it("is not confused with a server that answers with an error", async () => {
    ;(global.fetch as unknown) = jest.fn((_url: string, init?: { signal?: AbortSignal }) => silent(init))
    const first = expect(client.request("/mobile/kpi?period=day")).rejects.toThrow("REQUEST_TIMEOUT")
    await jest.advanceTimersByTimeAsync(20_000)
    await first

    ;(global.fetch as unknown) = jest.fn(() => answered(503, { error: "Service unavailable" }))
    await expect(client.request("/mobile/kpi?period=day")).rejects.toThrow("Service unavailable")

    ;(global.fetch as unknown) = jest.fn((_url: string, init?: { signal?: AbortSignal }) => silent(init))
    const third = expect(client.request("/mobile/kpi?period=day")).rejects.toThrow("REQUEST_TIMEOUT")
    await jest.advanceTimersByTimeAsync(20_000)
    await third

    // Silent, answered, silent: never two silences in a row, never a full close.
    expect(dropConnections.mock.calls.map(([includeBusy]) => includeBusy)).toEqual([false, false])
  })

  it("a screen that left before the answer is not a silent server", async () => {
    ;(global.fetch as unknown) = jest.fn((_url: string, init?: { signal?: AbortSignal }) => silent(init))
    const leaving = new AbortController()

    const outcome = expect(client.request("/mobile/kpi?period=day", { signal: leaving.signal })).rejects.toThrow("ABORTED")
    leaving.abort()
    await outcome

    expect(dropConnections).not.toHaveBeenCalled()
  })
})

/**
 * A 401 on any endpoint asks bootstrap whether the session is really gone, and
 * the request that got the 401 waits for that answer. The check had no
 * deadline, and the client under it had none either.
 */
describe("the session check behind a 401", () => {
  it("gives up after twelve seconds instead of holding its request for ever", async () => {
    client.token = "session-token"
    const fetchMock = jest.fn((url: string, init?: { signal?: AbortSignal }) =>
      String(url).endsWith("/mobile/bootstrap") ? silent(init) : answered(401, { error: "Unauthorized" }))
    ;(global.fetch as unknown) = fetchMock
    const revoked = jest.fn()
    api.setUnauthorizedHandler(revoked)

    const outcome = expect(client.request("/mobile/kpi?period=day")).rejects.toThrow("SESSION_EXPIRED")
    await jest.advanceTimersByTimeAsync(12_000)
    await outcome

    expect(fetchMock.mock.calls.map(([url]) => String(url).split("/mtm")[1])).toEqual(["/mobile/kpi?period=day", "/mobile/bootstrap"])
    // No answer about the session is not a verdict on it.
    expect(revoked).not.toHaveBeenCalled()
    expect(client.token).toBe("session-token")
  })
})

describe("where the rest of it lives", () => {
  const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8")
  const native = "android/app/src/main/java/com/mtmobileapp"

  it("the access screen redials when an attempt got nothing, and not after one that was answered", () => {
    const screen = read("src/screens/auth/RouteFieldAccessScreen.android.tsx")
    expect(screen).toContain('redial("access check got no answer")')
    expect(screen).toContain("if (deadline) clearTimeout(deadline)")
  })

  it("the app drops what it kept when it returns to the screen, before asking the server anything", () => {
    const app = read("src/runtime/AndroidApp.tsx")
    const dropped = app.indexOf('dropIdleConnections("app returned to the screen")')
    expect(dropped).toBeGreaterThan(-1)
    expect(app.indexOf("refreshAdmissionAndSync().catch(() => {})", dropped)).toBeGreaterThan(dropped)
  })

  it("React Native gets the app's own client, installed before it builds its networking", () => {
    const application = read(`${native}/MainApplication.kt`)
    const installed = application.indexOf("FieldHttp.install(this)")
    expect(installed).toBeGreaterThan(-1)
    expect(application.indexOf("loadReactNative(this)")).toBeGreaterThan(installed)

    const http = read(`${native}/FieldHttp.kt`)
    expect(http).toContain("OkHttpClientProvider.setOkHttpClientFactory(this)")
    expect(http).toContain("override fun createNewNetworkModuleClient(): OkHttpClient = client")
  })

  it("that client gives up on a server that does not pick up and on a socket gone silent", () => {
    const http = read(`${native}/FieldHttp.kt`)
    expect(http).toContain(".connectTimeout(CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS)")
    expect(http).toContain(".readTimeout(SILENCE_TIMEOUT_SECONDS, TimeUnit.SECONDS)")
    expect(http).toContain(".writeTimeout(SILENCE_TIMEOUT_SECONDS, TimeUnit.SECONDS)")
  })

  it("a change of the phone's network closes every connection made on the old one", () => {
    const http = read(`${native}/FieldHttp.kt`)
    expect(http).toContain("connectivity.registerDefaultNetworkCallback(")
    expect(http).toContain('reset(includeBusy = true, reason = "default network changed")')
  })

  it("the app can reach it: the module is registered under the name the app calls", () => {
    expect(read(`${native}/PresentationFilesPackage.kt`)).toContain("FieldNetworkModule(reactContext),")
    const module = read(`${native}/FieldNetworkModule.kt`)
    expect(module).toContain('override fun getName(): String = "FieldNetwork"')
    expect(module).toContain("fun dropConnections(includeBusy: Boolean, reason: String)")
    expect(read("src/services/connection-health.ts")).toContain("NativeModules.FieldNetwork")
  })
})
