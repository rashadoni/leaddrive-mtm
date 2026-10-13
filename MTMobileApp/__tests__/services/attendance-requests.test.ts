import AsyncStorage from "@react-native-async-storage/async-storage"
jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"))
jest.mock("../../src/services/api", () => ({ api: { getAttendanceRequests: jest.fn(), getAttendanceQuota: jest.fn(), submitAttendanceRequest: jest.fn(), cancelAttendanceRequest: jest.fn(), uploadAttendanceDocument: jest.fn(), syncPush: jest.fn() } }))
jest.mock("../../src/store/auth", () => ({ useAuthStore: { getState: jest.fn() } }))
jest.mock("../../src/store/bootstrap", () => ({ useBootstrapStore: { getState: jest.fn() } }))
jest.mock("react-native-fs", () => ({ __esModule: true, default: { DocumentDirectoryPath: "/private", stat: jest.fn().mockResolvedValue({ isFile: () => true, size: 200 }), mkdir: jest.fn().mockResolvedValue(undefined), copyFile: jest.fn().mockResolvedValue(undefined), unlink: jest.fn().mockResolvedValue(undefined) } }))
import { api } from "../../src/services/api"
import { useAuthStore } from "../../src/store/auth"
import { useBootstrapStore } from "../../src/store/bootstrap"
import { setOfflineScope } from "../../src/services/offline-scope"
import { allOutboxOperations, enqueueOutboxOperation, flushOutbox, retryOutboxConflict } from "../../src/services/outbox"
import { cachedAttendanceRequests, discardAttendanceDraftDocuments, keepAttendanceDocument, loadAttendanceQuota, loadAttendanceRequests, pushAttendanceAndLegacy, queueAttendanceCancellation, queueAttendanceRequest } from "../../src/services/attendance-requests"
import { attendanceUuid, validAttendanceInput, type AttendanceInput, type AttendanceRequest } from "../../src/services/attendance-contract"
import { agentMayAttendanceRequests } from "../../src/lib/agent-permissions"

const scope = "fictional-org:fictional-agent"
const input = (): AttendanceInput => ({ clientRequestId: attendanceUuid(), kind: "HOURLY_ABSENCE", unit: "HOURS", startDate: "2026-10-14", endDate: "2026-10-14", startTime: "10:00", endTime: "12:00", reason: "Fictional appointment", attachmentIds: [] })
const record = (value: AttendanceInput, status: AttendanceRequest["status"] = "PENDING"): AttendanceRequest => ({
  id: "record-1", clientRequestId: value.clientRequestId, status, startDate: value.startDate, endDate: value.endDate, reason: value.reason,
  submittedAt: "2026-10-13T08:00:00Z", decidedAt: null, decisionNote: null, cancelledAt: null, version: "2026-10-13T08:00:00Z",
  details: { kind: value.kind, unit: value.unit, startTime: value.startTime ?? null, endTime: value.endTime ?? null, timezone: "Asia/Baku", attachmentIds: value.attachmentIds },
})
const boot = (enabled = true) => ({ routeFieldAccess: "enabled", data: { policies: { agentPermissions: { attendanceRequests: enabled } } } })
beforeEach(async () => {
  jest.clearAllMocks()
  await AsyncStorage.clear()
  setOfflineScope("fictional-org", "fictional-agent")
  ;(useAuthStore.getState as jest.Mock).mockReturnValue({ agent: { id: "fictional-agent", organizationId: "fictional-org", role: "AGENT" } })
  ;(useBootstrapStore.getState as jest.Mock).mockReturnValue(boot())
  ;(api.submitAttendanceRequest as jest.Mock).mockImplementation(async value => ({ success: true, data: { request: record(value), idempotent: false } }))
  ;(api.getAttendanceRequests as jest.Mock).mockResolvedValue({ success: true, data: { items: [], nextCursor: null } })
  ;(api.syncPush as jest.Mock).mockImplementation(async operations => ({ results: operations.map((item: { operationId: string }) => ({ operationId: item.operationId, status: "ok" })) }))
})

it("requires an explicit new permission; retained permissions and missing values cannot open attendance", () => {
  const missingOrDisabled: Parameters<typeof agentMayAttendanceRequests>[0][] = [undefined, null, {}, { agentPermissions: { hrmRequests: true } }, { agentPermissions: { attendanceRequests: false } }]
  for (const value of missingOrDisabled) expect(agentMayAttendanceRequests(value)).toBe(false)
  expect(agentMayAttendanceRequests({ agentPermissions: { attendanceRequests: true } })).toBe(true)
})
it("validates full same-day correction clock pairs and real calendar dates", () => {
  expect(validAttendanceInput(input())).toBe(true)
  expect(validAttendanceInput({ ...input(), kind: "TIME_CORRECTION", unit: "DAYS", startTime: undefined, endTime: undefined })).toBe(false)
  expect(validAttendanceInput({ ...input(), endTime: "09:00" })).toBe(false)
  expect(validAttendanceInput({ ...input(), startDate: "2026-02-30" })).toBe(false)
  expect(validAttendanceInput({ ...input(), endDate: "2026-10-15" })).toBe(false)
})
it("persists the request before transport, survives a lost response and retries the same UUID/input", async () => {
  const value = input()
  const first = await queueAttendanceRequest(scope, value, [])
  expect((await queueAttendanceRequest(scope, value, [])).operationId).toBe(first.operationId)
  expect(api.submitAttendanceRequest).not.toHaveBeenCalled()
  ;(api.submitAttendanceRequest as jest.Mock).mockRejectedValueOnce(new Error("lost reply"))
  expect((await pushAttendanceAndLegacy(await allOutboxOperations())).results[0].status).toBe("deferred")
  expect(await allOutboxOperations()).toHaveLength(1)
  expect((await flushOutbox(pushAttendanceAndLegacy)).sent).toBe(1)
  expect((api.submitAttendanceRequest as jest.Mock).mock.calls.map(call => call[0])).toEqual([value, value])
  expect(await allOutboxOperations()).toHaveLength(0)
  expect((await cachedAttendanceRequests(scope)).items[0].clientRequestId).toBe(value.clientRequestId)
  expect(api.syncPush).not.toHaveBeenCalled()
})
it("uploads private documents first, durably freezes ids, and never reuploads after an ambiguous create", async () => {
  const value = input()
  const document = await keepAttendanceDocument(scope, "/camera/photo.jpg")
  const attachmentId = attendanceUuid()
  ;(api.uploadAttendanceDocument as jest.Mock).mockResolvedValue({ success: true, data: { id: attachmentId } })
  ;(api.submitAttendanceRequest as jest.Mock).mockImplementationOnce(async sent => {
    expect((await allOutboxOperations())[0].data.attachmentIds).toEqual([attachmentId])
    expect(sent.attachmentIds).toEqual([attachmentId])
    throw new Error("lost reply")
  })
  await queueAttendanceRequest(scope, value, [document])
  await pushAttendanceAndLegacy(await allOutboxOperations())
  await flushOutbox(pushAttendanceAndLegacy)
  expect(api.uploadAttendanceDocument).toHaveBeenCalledTimes(1)
  expect(api.uploadAttendanceDocument).toHaveBeenCalledWith(value.clientRequestId, document.clientAttachmentId, document.path, expect.any(Function))
  expect((api.submitAttendanceRequest as jest.Mock).mock.calls[0][0]).toEqual((api.submitAttendanceRequest as jest.Mock).mock.calls[1][0])
  expect((api.submitAttendanceRequest as jest.Mock).mock.calls[1][0]).not.toHaveProperty("attendanceDocuments")
})
it("a lost upload response retries the same document id and sends no partial request", async () => {
  const value = input(), document = await keepAttendanceDocument(scope, "/camera/photo.jpg")
  ;(api.uploadAttendanceDocument as jest.Mock).mockRejectedValueOnce(new Error("no reply")).mockResolvedValue({ success: true, data: { id: attendanceUuid() } })
  await queueAttendanceRequest(scope, value, [document])
  await pushAttendanceAndLegacy(await allOutboxOperations())
  expect(api.submitAttendanceRequest).not.toHaveBeenCalled()
  await flushOutbox(pushAttendanceAndLegacy)
  expect((api.uploadAttendanceDocument as jest.Mock).mock.calls[0].slice(0, 3)).toEqual((api.uploadAttendanceDocument as jest.Mock).mock.calls[1].slice(0, 3))
})
it("keeps feature-disabled pending evidence without sending to either API", async () => {
  await queueAttendanceRequest(scope, input(), [])
  ;(useBootstrapStore.getState as jest.Mock).mockReturnValue(boot(false))
  await pushAttendanceAndLegacy(await allOutboxOperations())
  expect(api.submitAttendanceRequest).not.toHaveBeenCalled()
  expect(api.syncPush).not.toHaveBeenCalled()
  expect(await allOutboxOperations()).toHaveLength(1)
})
it("fences an upload response after account switching before persisting or posting", async () => {
  const value = input(), document = await keepAttendanceDocument(scope, "/camera/photo.jpg")
  let resolve!: (value: unknown) => void
  let started!: () => void
  const starting = new Promise<void>(done => { started = done })
  ;(api.uploadAttendanceDocument as jest.Mock).mockImplementation(() => { started(); return new Promise(done => { resolve = done }) })
  await queueAttendanceRequest(scope, value, [document])
  const sending = pushAttendanceAndLegacy(await allOutboxOperations())
  await starting
  setOfflineScope("other-org", "other-agent")
  resolve({ success: true, data: { id: attendanceUuid() } })
  await expect(sending).rejects.toThrow("ATTENDANCE_SCOPE_CHANGED")
  expect(api.submitAttendanceRequest).not.toHaveBeenCalled()
  expect(await allOutboxOperations()).toHaveLength(0)
  setOfflineScope("fictional-org", "fictional-agent")
  expect((await allOutboxOperations())[0].data.attachmentIds).toEqual([])
})
it("pins quota refusals as conflicts and explicit retries keep the request UUID", async () => {
  const value = input()
  await queueAttendanceRequest(scope, value, [])
  ;(api.submitAttendanceRequest as jest.Mock).mockRejectedValueOnce({ status: 409, code: "MTM_ATTENDANCE_REQUEST_COUNT_LIMIT", message: "private details must not be retained" })
  expect((await flushOutbox(pushAttendanceAndLegacy)).conflicted).toBe(1)
  const conflict = (await allOutboxOperations())[0]
  expect(conflict.conflict?.error).toBe("MTM_ATTENDANCE_REQUEST_COUNT_LIMIT")
  expect(JSON.stringify(conflict)).not.toContain("private details")
  await retryOutboxConflict(conflict.operationId)
  await flushOutbox(pushAttendanceAndLegacy)
  expect((api.submitAttendanceRequest as jest.Mock).mock.calls[1][0]).toEqual(value)
})
it("durably queues only own pending cancellation and waits for confirmed CANCELLED", async () => {
  const row = record(input())
  ;(api.getAttendanceRequests as jest.Mock).mockResolvedValueOnce({ success: true, data: { items: [row], nextCursor: null } })
  await loadAttendanceRequests(scope)
  ;(api.cancelAttendanceRequest as jest.Mock).mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ success: true, data: { request: { ...row, status: "CANCELLED" } } })
  await queueAttendanceCancellation(scope, row)
  await pushAttendanceAndLegacy(await allOutboxOperations())
  expect(await allOutboxOperations()).toHaveLength(1)
  await flushOutbox(pushAttendanceAndLegacy)
  expect((await cachedAttendanceRequests(scope)).items[0].status).toBe("CANCELLED")
  await expect(queueAttendanceCancellation(scope, { ...row, status: "APPROVED" })).rejects.toThrow()
})
it("keeps existing legacy operations on syncPush, attendance only on the dedicated API", async () => {
  await enqueueOutboxOperation({ entity: "tasks", op: "update", data: { id: "task" } })
  await queueAttendanceRequest(scope, input(), [])
  expect((await flushOutbox(pushAttendanceAndLegacy)).sent).toBe(2)
  expect((api.syncPush as jest.Mock).mock.calls[0][0].map((row: { entity: string }) => row.entity)).toEqual(["tasks"])
})
it.each([401, 403, 404])("clears private read cache after an authoritative %s", async status => {
  const row = { ...record(input()), latitude: 99, secret: "extra" }
  ;(api.getAttendanceRequests as jest.Mock).mockResolvedValueOnce({ success: true, data: { items: [row], nextCursor: null } }).mockRejectedValueOnce({ status })
  await loadAttendanceRequests(scope)
  expect(JSON.stringify(await cachedAttendanceRequests(scope))).not.toContain("latitude")
  expect(JSON.stringify(await cachedAttendanceRequests(scope))).not.toContain("extra")
  await expect(loadAttendanceRequests(scope)).rejects.toEqual({ status })
  expect((await cachedAttendanceRequests(scope)).items).toEqual([])
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
it("a late older read cannot overwrite the newer decision in persistent cache", async () => {
  const row = record(input()), older = deferred<unknown>()
  ;(api.getAttendanceRequests as jest.Mock).mockReturnValueOnce(older.promise).mockResolvedValueOnce({ success: true, data: { items: [{ ...row, status: "APPROVED", version: "2026-10-13T09:00:00Z" }], nextCursor: null } })
  const oldRead = loadAttendanceRequests(scope)
  const rejectedOld = expect(oldRead).rejects.toThrow("ATTENDANCE_READ_SUPERSEDED")
  await loadAttendanceRequests(scope)
  older.resolve({ success: true, data: { items: [row], nextCursor: null } })
  await rejectedOld
  expect((await cachedAttendanceRequests(scope)).items[0].status).toBe("APPROVED")
})
it("a quota refusal clears private cache and fences a list already in flight", async () => {
  const older = deferred<unknown>()
  ;(api.getAttendanceRequests as jest.Mock).mockReturnValueOnce(older.promise)
  const oldRead = loadAttendanceRequests(scope)
  const rejectedOld = expect(oldRead).rejects.toThrow("ATTENDANCE_READ_SUPERSEDED")
  ;(api.getAttendanceQuota as jest.Mock).mockRejectedValueOnce({ status: 403 })
  await expect(loadAttendanceQuota(scope, "2026-10")).rejects.toEqual({ status: 403 })
  older.resolve({ success: true, data: { items: [record(input())], nextCursor: null } })
  await rejectedOld
  expect((await cachedAttendanceRequests(scope)).items).toEqual([])
  expect(await AsyncStorage.getItem(`@mtm_attendance_requests_v1:${scope}`)).toBeNull()
})
it("a list that started before acceptance cannot erase the accepted request", async () => {
  const older = deferred<unknown>(), value = input()
  ;(api.getAttendanceRequests as jest.Mock).mockReturnValueOnce(older.promise)
  const oldRead = loadAttendanceRequests(scope)
  const rejectedOld = expect(oldRead).rejects.toThrow("ATTENDANCE_READ_SUPERSEDED")
  await queueAttendanceRequest(scope, value, [])
  await flushOutbox(pushAttendanceAndLegacy)
  older.resolve({ success: true, data: { items: [], nextCursor: null } })
  await rejectedOld
  expect((await cachedAttendanceRequests(scope)).items[0].clientRequestId).toBe(value.clientRequestId)
})
it("deletes abandoned private drafts but retains another account's queued evidence", async () => {
  const fs = require("react-native-fs").default
  const queued = await keepAttendanceDocument(scope, "/camera/queued.jpg")
  const abandoned = await keepAttendanceDocument(scope, "/camera/abandoned.jpg")
  await queueAttendanceRequest(scope, input(), [queued])
  setOfflineScope("other-org", "other-agent")
  await discardAttendanceDraftDocuments([queued, abandoned])
  expect(fs.unlink).toHaveBeenCalledTimes(1)
  expect(fs.unlink).toHaveBeenCalledWith(abandoned.path)
})
it.each(["{broken", "{}", "[null]"])("does not infer that private evidence is disposable from unreadable outbox %s", async raw => {
  const fs = require("react-native-fs").default
  const document = await keepAttendanceDocument(scope, "/camera/photo.jpg")
  await AsyncStorage.setItem("@mtm_sync_outbox_v1", raw)
  await expect(discardAttendanceDraftDocuments([document])).rejects.toThrow()
  expect(fs.unlink).not.toHaveBeenCalled()
})
it("cannot replace a previously queued document under the same request UUID", async () => {
  const value = input()
  const first = await keepAttendanceDocument(scope, "/camera/first.jpg")
  const replacement = await keepAttendanceDocument(scope, "/camera/replacement.jpg")
  await queueAttendanceRequest(scope, value, [first])
  await expect(queueAttendanceRequest(scope, value, [replacement])).rejects.toThrow("ATTENDANCE_ALREADY_QUEUED")
  expect((await allOutboxOperations())[0].attendanceDocuments).toEqual([first])
})
it("reads an HR record snapshot without retaining recording identities or opening a ninth submission kind", async () => {
  const row = record(input(), "APPROVED")
  const dayKind = { code: "X1", names: { az: "Xüsusi gün", ru: "Особый день", en: "Special day" } }
  ;(api.getAttendanceRequests as jest.Mock).mockResolvedValueOnce({ success: true, data: { items: [{ ...row, details: { ...row.details, kind: "HR_RECORD", dayKind: { ...dayKind, serverOnly: "private catalogue metadata" }, recording: { userId: "private-reviewer", operationId: "private-operation" } } }], nextCursor: null } })
  const result = await loadAttendanceRequests(scope)
  expect(result.items[0].details).toMatchObject({ kind: "HR_RECORD", dayKind })
  const cache = await cachedAttendanceRequests(scope)
  expect(cache.items[0].details.dayKind).toEqual(dayKind)
  expect(JSON.stringify(cache)).not.toMatch(/private-|recording|serverOnly|catalogue metadata/)
  expect(validAttendanceInput({ ...input(), kind: "HR_RECORD" } as unknown as AttendanceInput)).toBe(false)
  await expect(queueAttendanceCancellation(scope, { ...cache.items[0], status: "PENDING" })).rejects.toThrow("ATTENDANCE_ALREADY_DECIDED")
})
it("does not repopulate revoked private cache with an already-in-flight create response", async () => {
  const value = input(), response = deferred<unknown>(), started = deferred<void>()
  ;(api.submitAttendanceRequest as jest.Mock).mockImplementationOnce(() => { started.resolve(); return response.promise })
  await queueAttendanceRequest(scope, value, [])
  const sending = pushAttendanceAndLegacy(await allOutboxOperations())
  await started.promise
  ;(api.getAttendanceQuota as jest.Mock).mockRejectedValueOnce({ status: 403 })
  await expect(loadAttendanceQuota(scope, "2026-10")).rejects.toEqual({ status: 403 })
  response.resolve({ success: true, data: { request: record(value) } })
  expect((await sending).results[0].status).toBe("deferred")
  expect((await cachedAttendanceRequests(scope)).items).toEqual([])
  expect(await allOutboxOperations()).toHaveLength(1)
})
it("retains private evidence when storage persisted the queue but lost its acknowledgement", async () => {
  const fs = require("react-native-fs").default
  const document = await keepAttendanceDocument(scope, "/camera/photo.jpg")
  const persist = (AsyncStorage.setItem as jest.Mock).getMockImplementation()!
  ;(AsyncStorage.setItem as jest.Mock).mockImplementationOnce(async (...args: unknown[]) => {
    await persist(...args)
    throw new Error("lost storage acknowledgement")
  })
  await expect(queueAttendanceRequest(scope, input(), [document])).rejects.toThrow("lost storage acknowledgement")
  await discardAttendanceDraftDocuments([document])
  expect(fs.unlink).not.toHaveBeenCalled()
  expect((await allOutboxOperations())[0].attendanceDocuments).toEqual([document])
})

it('persists a safe QR receipt before acknowledgement and retries the exact token after a storage failure', async () => {
  ;(useAuthStore.getState as jest.Mock).mockReturnValue({isLoggedIn:true,agent:{id:'fictional-agent',organizationId:'fictional-org',role:'AGENT'}})
  const first=await enqueueOutboxOperation({entity:'workdays',op:'create',data:{action:'START',id:'qr-day',occurredAt:'2026-10-13T08:00:00Z',attendanceQr:{version:1,token:'fictional-private-qr'}}})
  ;(api.syncPush as jest.Mock).mockImplementation(async operations=>({results:operations.map((item:{operationId:string})=>({operationId:item.operationId,status:'ok',serverData:{attendanceQr:{eventId:'qr-event',state:'VERIFIED',branch:{id:'qr-branch',name:'Fictional branch'}}}}))}))
  const nativeSet=AsyncStorage.setItem
  const originalSet=(nativeSet as jest.Mock).getMockImplementation()!
  ;(nativeSet as jest.Mock).mockImplementationOnce(async (key:string,value:string)=>{if(key.startsWith('@mtm_attendance_qr_receipts'))throw new Error('disk');return originalSet(key,value)})
  await flushOutbox(pushAttendanceAndLegacy)
  expect((await allOutboxOperations()).map(row=>row.operationId)).toEqual([first.operationId])
  // Retry after the recorded backoff; the durable operation must be identical.
  const deferred=(await allOutboxOperations())[0]
  const clock=jest.spyOn(Date,'now').mockReturnValue(deferred.nextAttemptAt+1)
  try {
    expect((await flushOutbox(pushAttendanceAndLegacy)).sent).toBe(1)
    expect(await allOutboxOperations()).toEqual([])
  } finally { clock.mockRestore() }
  const calls=(api.syncPush as jest.Mock).mock.calls
  expect(calls).toHaveLength(2)
  expect(calls[0][0][0].operationId).toBe(calls[1][0][0].operationId)
  expect(calls[0][0][0].data.attendanceQr).toEqual(calls[calls.length-1][0][0].data.attendanceQr)
  const receipt=await AsyncStorage.getItem('@mtm_attendance_qr_receipts_v1:'+scope)
  expect(receipt).toContain('qr-event');expect(receipt).not.toContain('fictional-private-qr')
})
