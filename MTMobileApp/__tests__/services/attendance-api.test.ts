jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"))
jest.mock("../../src/services/sentry", () => ({ setAgentContext: jest.fn(), clearAgentContext: jest.fn() }))
jest.mock("../../src/services/field-device-id", () => ({ getFieldDeviceId: jest.fn().mockResolvedValue("rf-fictional-device") }))
import AsyncStorage from "@react-native-async-storage/async-storage"
import { api } from "../../src/services/api"
import { getFieldDeviceId } from "../../src/services/field-device-id"
import { attendanceUuid, type AttendanceInput } from "../../src/services/attendance-contract"
const client = api as unknown as { baseUrl: string; token: string | null }
const originalFetch = global.fetch
const nativeGlobals = globalThis as typeof globalThis & { FormData: typeof FormData }
const originalFormData = nativeGlobals.FormData
const NativeFormDataModule = require("react-native/Libraries/Network/FormData")
const NativeFormData = NativeFormDataModule.default ?? NativeFormDataModule
beforeAll(() => { nativeGlobals.FormData = NativeFormData })
beforeEach(() => {
  jest.clearAllMocks()
  client.baseUrl = "https://fictional.invalid/api/v1/mtm"
  client.token = "fictional-token"
  ;(getFieldDeviceId as jest.Mock).mockResolvedValue("rf-fictional-device")
  global.fetch = jest.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ success: true, data: {} }) })
})
afterAll(() => { global.fetch = originalFetch; nativeGlobals.FormData = originalFormData })
it("reads only the encoded own workday through the v2 guarded evidence endpoint", async () => {
  const guard = jest.fn()
  await api.getOwnAttendanceMarks("day&agentId=foreign", guard)
  expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe("https://fictional.invalid/api/v2/mtm/mobile/route-field/attendance/marks?workdayId=day%26agentId%3Dforeign")
  expect((global.fetch as jest.Mock).mock.calls[0][1].method).toBe("GET")
  expect((global.fetch as jest.Mock).mock.calls[0][1].body).toBeUndefined()
  expect(guard).toHaveBeenCalled()
})
it("uses ordinary authenticated own-list/quota/create/cancel API doors", async () => {
  const guard = jest.fn()
  const value: AttendanceInput = { clientRequestId: attendanceUuid(), kind: "ANNUAL_LEAVE", unit: "DAYS", startDate: "2026-10-14", endDate: "2026-10-15", reason: "Fictional leave", attachmentIds: [] }
  await api.getAttendanceRequests("cursor-id", guard)
  await api.getAttendanceQuota("2026-10", guard)
  await api.submitAttendanceRequest(value, guard)
  await api.cancelAttendanceRequest("own-id", guard)
  const calls = (global.fetch as jest.Mock).mock.calls
  expect(calls.map(call => call[0])).toEqual([
    "https://fictional.invalid/api/v2/mtm/mobile/route-field/attendance/requests?cursor=cursor-id",
    "https://fictional.invalid/api/v2/mtm/mobile/route-field/attendance/request-limits?month=2026-10",
    "https://fictional.invalid/api/v2/mtm/mobile/route-field/attendance/requests",
    "https://fictional.invalid/api/v2/mtm/mobile/route-field/attendance/requests/own-id",
  ])
  expect(calls[2][1].body).toBe(JSON.stringify(value))
  expect(calls[3][1].method).toBe("DELETE")
  expect(calls.every(call => call[1].headers.Authorization === "Bearer fictional-token")).toBe(true)
})
it("uploads private multipart bytes with no location or visit fields and lets native fetch choose the boundary", async () => {
  await api.uploadAttendanceDocument("request-uuid", "document-uuid", "/private/document.jpg", () => {})
  const [url, options] = (global.fetch as jest.Mock).mock.calls[0]
  expect(url).toBe("https://fictional.invalid/api/v2/mtm/mobile/route-field/attendance/attachments")
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
it.each(['background', 'return'])('guards %s transport after asynchronous headers and before fetch', async kind => {
  let valid = true
  ;(getFieldDeviceId as jest.Mock).mockImplementation(async () => { valid = false; return 'rf-device' })
  const guard = () => { if (!valid) throw new Error('scope changed') }
  const request = kind === 'background'
    ? api.sendLocation({ latitude: 40.4, longitude: 49.8, isMock: false, attendanceConsentId: 'fictional-receipt' }, guard)
    : api.returnToWorkday({ operationId: 'wdr-fixture', workdayId: 'wd-fixture' }, guard)
  await expect(request).rejects.toThrow('scope changed')
  expect(global.fetch).not.toHaveBeenCalled()
})
it("does not return an old account's response after its scope changes", async () => {
  let valid = true
  ;(global.fetch as jest.Mock).mockImplementation(async () => { valid = false; return { status: 200, ok: true, json: async () => ({ success: true, data: { private: "old account" } }) } })
  await expect(api.getAttendanceRequests(undefined, () => { if (!valid) throw new Error("scope changed") })).rejects.toThrow("scope changed")
})
it("uses only v1 own inbox GET/PATCH and guards the workday sync transport", async () => {
  const guard = jest.fn()
  await api.getOwnAttendanceNotifications(guard)
  await api.markOwnAttendanceNotifications(["own-notice"], guard)
  await api.syncPush([{ operationId: "owned", entity: "workdays", op: "create", data: { action: "PAUSE" }, clientTimestamp: 1 }], guard)
  const calls = (global.fetch as jest.Mock).mock.calls
  expect(calls.map(call => call[0])).toEqual(["https://fictional.invalid/api/v1/mtm/mobile/notifications", "https://fictional.invalid/api/v1/mtm/mobile/notifications", "https://fictional.invalid/api/v1/mtm/mobile/sync/push"])
  expect(calls[1][1].method).toBe("PATCH"); expect(JSON.parse(calls[1][1].body)).toEqual({ ids: ["own-notice"], isRead: true })
  expect(guard).toHaveBeenCalled()
})
it("does not send a workday after its admission changes during device identity lookup", async () => {
  let valid = true
  ;(getFieldDeviceId as jest.Mock).mockImplementation(async () => { valid = false; return "rf-device" })
  await expect(api.syncPush([], () => { if (!valid) throw new Error("withdrawn") })).rejects.toThrow("withdrawn")
  expect(global.fetch).not.toHaveBeenCalled()
})
it("uses only guarded own consent API and preserves the exact revision and request UUID", async () => {
  const input = { requestId: attendanceUuid(), policyRevisionId: "own-policy", expectedConsentId: "own-receipt", accepted: false }
  const guard = jest.fn()
  await api.getAttendanceLocationConsent(guard); await api.setAttendanceLocationConsent(input, guard)
  const calls = (global.fetch as jest.Mock).mock.calls
  expect(calls.map(call => call[0])).toEqual(["https://fictional.invalid/api/v2/mtm/mobile/route-field/attendance/location-consent", "https://fictional.invalid/api/v2/mtm/mobile/route-field/attendance/location-consent"])
  expect(calls[1][1].body).toBe(JSON.stringify(input)); expect(calls[1][1].method).toBe("POST"); expect(guard).toHaveBeenCalled()
})

it("preserves the v1 background location route and sends the exact consent-bound body", async () => {
  const guard = jest.fn()
  const point = { latitude: 40.4, longitude: 49.8, workdayId: "wd-fictional", clientLocationId: "point-fictional", recordedAt: "2026-10-13T10:00:00.000Z", isMock: false, attendanceConsentId: "receipt-fictional" }
  await api.sendLocation(point, guard)
  const [url, options] = (global.fetch as jest.Mock).mock.calls[0]
  expect(url).toBe("https://fictional.invalid/api/v1/mtm/mobile/location")
  expect(options.method).toBe("POST")
  expect(options.body).toBe(JSON.stringify(point))
  expect(options.headers.Authorization).toBe("Bearer fictional-token")
  expect(guard).toHaveBeenCalled()
})

it('sends an installation request through the current guarded device header without a device body',async()=>{
  const guard=jest.fn(),requestId=attendanceUuid()
  await api.getAttendanceInstallation(guard); await api.requestAttendanceInstallation({requestId},guard)
  const calls=(global.fetch as jest.Mock).mock.calls
  expect(calls.map(call=>call[0])).toEqual(['https://fictional.invalid/api/v2/mtm/mobile/route-field/attendance/installation','https://fictional.invalid/api/v2/mtm/mobile/route-field/attendance/installation'])
  expect(calls[1][1].headers['x-field-device-id']).toBe('rf-fictional-device');expect(JSON.parse(calls[1][1].body)).toEqual({requestId});expect(guard).toHaveBeenCalled()
})
it.each([false,true,'false',undefined])('copies only exact uncommitted duplicate receipt (%s)',async committed=>{
  global.fetch=jest.fn().mockResolvedValue({status:409,ok:false,json:async()=>({error:'duplicate',code:'MTM_ATTENDANCE_INSTALLATION_ALREADY_REQUESTED',data:{committed,private:'must not escape'}})})
  const result=await api.requestAttendanceInstallation({requestId:attendanceUuid()},()=>{}).catch(error=>error)
  expect(result.committed).toBe(committed===false?false:undefined);expect(result.data).toBeUndefined();expect(result.private).toBeUndefined()
})
it('does not transform an idempotency mismatch into an uncommitted request',async()=>{
  global.fetch=jest.fn().mockResolvedValue({status:409,ok:false,json:async()=>({code:'MTM_ATTENDANCE_INSTALLATION_IDEMPOTENCY_MISMATCH',data:{committed:false}})})
  const result=await api.requestAttendanceInstallation({requestId:attendanceUuid()},()=>{}).catch(error=>error)
  expect(result.committed).toBeUndefined()
})

it('binds offline snapshots to this server and login, keeping restoration stable but rotating on a new login', async () => {
  const storage = AsyncStorage
  await storage.setItem('@mtm_server', 'fictional.invalid')
  await storage.removeItem('@mtm_attendance_login_v1')
  expect(await api.getAttendanceOfflineContext()).toBeNull()
  const first = await api.getAttendanceOfflineContext(true)
  expect(first?.server).toBe('fictional.invalid')
  expect(await api.getAttendanceOfflineContext()).toEqual(first)
  const internal = api as unknown as { acceptSession: (value: unknown) => Promise<void> }
  await internal.acceptSession({ data: { token: 'new-fictional-token', agent: { id: 'office', organizationId: 'fictional', role: 'EMPLOYEE' } } })
  expect((await api.getAttendanceOfflineContext())?.session).not.toBe(first?.session)
  await api.logout()
  expect(await api.getAttendanceOfflineContext()).toBeNull()
  expect(await storage.getItem('@mtm_attendance_login_v1')).toBeNull()
})
