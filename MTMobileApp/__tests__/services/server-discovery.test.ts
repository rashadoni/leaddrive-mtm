jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(), multiRemove: jest.fn() },
}))
jest.mock("../../src/services/sentry", () => ({ setAgentContext: jest.fn(), clearAgentContext: jest.fn() }))
jest.mock("../../src/services/field-device-id", () => ({ getFieldDeviceId: jest.fn() }))
jest.mock("../../src/services/connection-health", () => ({ noteAnswered: jest.fn(), noteUnanswered: jest.fn() }))

import AsyncStorage from "@react-native-async-storage/async-storage"
import { api } from "../../src/services/api"

const originalFetch = global.fetch
const fetchMock = jest.fn()
const response = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300, status,
  text: async () => JSON.stringify(body),
})

beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); fetchMock.mockReset(); global.fetch = fetchMock })
afterEach(() => { global.fetch = originalFetch; jest.useRealTimers() })

it("an offline company lookup is unreachable and does not alter the selected server", async () => {
  fetchMock.mockRejectedValueOnce(new TypeError("Network request failed"))
  expect(await api.pingServer(" app ")).toMatchObject({ success: false, domain: "app.leaddrivecrm.org", reason: "unreachable" })
  expect(AsyncStorage.setItem).not.toHaveBeenCalled()
  expect(jest.getTimerCount()).toBe(0)
})

it("aborts a silent lookup after 30 seconds without calling the company absent", async () => {
  let signal!: AbortSignal
  fetchMock.mockImplementationOnce((_url: string, options: { signal: AbortSignal }) => {
    signal = options.signal
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("Aborted"), { name: "AbortError" }))))
  })
  const result = api.pingServer("app")
  await jest.advanceTimersByTimeAsync(29_999)
  expect(signal.aborted).toBe(false)
  await jest.advanceTimersByTimeAsync(1)
  expect(signal.aborted).toBe(true)
  expect(await result).toMatchObject({ success: false, reason: "unreachable", error: "Connection timeout" })
  expect(jest.getTimerCount()).toBe(0)
})

it("recognizes the backend's authoritative company-not-found response", async () => {
  fetchMock.mockResolvedValueOnce(response(404, { success: false, code: "MTM_COMPANY_NOT_FOUND" }))
  expect(await api.pingServer("missing-fixture")).toMatchObject({ success: false, reason: "not_found" })
})

it.each([
  [503, { success: false, code: "MTM_COMPANY_NOT_FOUND" }],
  [502, { success: true }],
  [404, { error: "Unknown proxy route" }],
  [200, { success: false }],
  [200, null],
])("does not infer a missing company from an ambiguous HTTP %s response", async (status, body) => {
  fetchMock.mockResolvedValueOnce(response(status as number, body))
  expect(await api.pingServer("app")).toMatchObject({ success: false, reason: "unreachable" })
})

it("keeps an HTML gateway error out of the company-not-found path", async () => {
  fetchMock.mockResolvedValueOnce({ ok: false, status: 502, text: async () => "<html>Gateway unavailable</html>" })
  expect(await api.pingServer("app")).toMatchObject({ success: false, reason: "unreachable" })
})

it("retries the same company successfully after the connection returns", async () => {
  fetchMock.mockRejectedValueOnce(new TypeError("Network request failed"))
    .mockResolvedValueOnce(response(200, { success: true, data: { name: "Fictional company" } }))
  expect((await api.pingServer("app")).success).toBe(false)
  expect(await api.pingServer("app")).toEqual({ success: true, domain: "app.leaddrivecrm.org", name: "Fictional company" })
  expect(fetchMock.mock.calls.map(call => call[0])).toEqual(Array(2).fill("https://app.leaddrivecrm.org/api/v1/mtm/mobile/ping"))
  expect(jest.getTimerCount()).toBe(0)
})
