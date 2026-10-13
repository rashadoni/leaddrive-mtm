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
import { cachedAttendanceRequests, keepAttendanceDocument, loadAttendanceRequests, pushAttendanceAndLegacy, queueAttendanceCancellation, queueAttendanceRequest } from "../../src/services/attendance-requests"
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
  for (const value of [undefined, null, {}, { agentPermissions: { hrmRequests: true } }, { agentPermissions: { attendanceRequests: false } }]) expect(agentMayAttendanceRequests(value)).toBe(false)
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
