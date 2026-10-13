jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"))
jest.mock("../../src/services/sentry", () => ({ setAgentContext: jest.fn(), clearAgentContext: jest.fn() }))
jest.mock("../../src/services/field-device-id", () => ({ getFieldDeviceId: jest.fn().mockResolvedValue("rf-fictional-device") }))
import { api } from "../../src/services/api"
import { getFieldDeviceId } from "../../src/services/field-device-id"
import { attendanceUuid, type AttendanceInput } from "../../src/services/attendance-contract"
const client = api as unknown as { baseUrl: string; token: string | null }
const originalFetch = global.fetch
const originalFormData = global.FormData
const NativeFormDataModule = require("react-native/Libraries/Network/FormData")
const NativeFormData = NativeFormDataModule.default ?? NativeFormDataModule
beforeAll(() => { global.FormData = NativeFormData })
beforeEach(() => {
  jest.clearAllMocks()
  client.baseUrl = "https://fictional.invalid/api/v1/mtm"
  client.token = "fictional-token"
  ;(getFieldDeviceId as jest.Mock).mockResolvedValue("rf-fictional-device")
  global.fetch = jest.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ success: true, data: {} }) })
})
afterAll(() => { global.fetch = originalFetch; global.FormData = originalFormData })
it("uses ordinary authenticated own-list/quota/create/cancel API doors", async () => {
  const guard = jest.fn()
  const value: AttendanceInput = { clientRequestId: attendanceUuid(), kind: "ANNUAL_LEAVE", unit: "DAYS", startDate: "2026-10-14", endDate: "2026-10-15", reason: "Fictional leave", attachmentIds: [] }
  await api.getAttendanceRequests("cursor-id", guard)
  await api.getAttendanceQuota("2026-10", guard)
  await api.submitAttendanceRequest(value, guard)
  await api.cancelAttendanceRequest("own-id", guard)
  const calls = (global.fetch as jest.Mock).mock.calls
  expect(calls.map(call => call[0])).toEqual([
    "https://fictional.invalid/api/v1/mtm/mobile/attendance/requests?cursor=cursor-id",
    "https://fictional.invalid/api/v1/mtm/mobile/attendance/request-limits?month=2026-10",
    "https://fictional.invalid/api/v1/mtm/mobile/attendance/requests",
    "https://fictional.invalid/api/v1/mtm/mobile/attendance/requests/own-id",
  ])
  expect(calls[2][1].body).toBe(JSON.stringify(value))
  expect(calls[3][1].method).toBe("DELETE")
  expect(calls.every(call => call[1].headers.Authorization === "Bearer fictional-token")).toBe(true)
})
it("uploads private multipart bytes with no location or visit fields and lets native fetch choose the boundary", async () => {
  await api.uploadAttendanceDocument("request-uuid", "document-uuid", "/private/document.jpg", () => {})
  const [url, options] = (global.fetch as jest.Mock).mock.calls[0]
  expect(url).toContain("/mobile/attendance/attachments")
  expect(options.headers["Content-Type"]).toBeUndefined()
  const parts = options.body.getParts()
  expect(parts.map((part: { fieldName: string }) => part.fieldName)).toEqual(["clientRequestId", "clientAttachmentId", "file"])
  expect(parts[2]).toMatchObject({ uri: "file:///private/document.jpg", type: "image/jpeg" })
  expect(JSON.stringify(parts)).not.toMatch(/latitude|longitude|visitId|watermark/)
})
it("checks the scope again after asynchronous device-header lookup, before sending anything", async () => {
  let valid = true
  ;(getFieldDeviceId as jest.Mock).mockImplementation(async () => { valid = false; return "rf-device" })
  await expect(api.getAttendanceRequests(undefined, () => { if (!valid) throw new Error("scope changed") })).rejects.toThrow("scope changed")
  expect(global.fetch).not.toHaveBeenCalled()
})
it("does not return an old account's response after its scope changes", async () => {
  let valid = true
  ;(global.fetch as jest.Mock).mockImplementation(async () => { valid = false; return { status: 200, ok: true, json: async () => ({ success: true, data: { private: "old account" } }) } })
  await expect(api.getAttendanceRequests(undefined, () => { if (!valid) throw new Error("scope changed") })).rejects.toThrow("scope changed")
})
