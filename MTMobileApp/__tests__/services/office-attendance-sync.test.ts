import AsyncStorage from "@react-native-async-storage/async-storage"
jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"))
jest.mock("../../src/services/api", () => ({ api: { syncPush: jest.fn(), getAttendanceRequests: jest.fn(), submitAttendanceRequest: jest.fn(), syncPull: jest.fn(), uploadPhoto: jest.fn() } }))
jest.mock("../../src/store/auth", () => ({ useAuthStore: { getState: jest.fn() } }))
jest.mock("../../src/store/bootstrap", () => ({ useBootstrapStore: { getState: jest.fn() } }))
jest.mock("../../src/services/route-command-journal", () => ({ allRouteCommandJournalEntries: jest.fn(), flushRouteCommandJournal: jest.fn() }))
jest.mock("../../src/services/media-outbox", () => ({ allMediaUploads: jest.fn(), flushMediaOutbox: jest.fn() }))
jest.mock("../../src/services/sync-cache", () => ({ pullAndApplySync: jest.fn() }))
jest.mock("../../src/services/sync-v2-routes", () => ({ clearRouteV2RoutesState: jest.fn(), syncRouteV2Routes: jest.fn() }))
import { api } from "../../src/services/api"
import { useAuthStore } from "../../src/store/auth"
import { useBootstrapStore } from "../../src/store/bootstrap"
import { useWorkdayStore } from "../../src/store/workday"
import { setOfflineScope } from "../../src/services/offline-scope"
import { enqueueOutboxOperation, allOutboxOperations, retryOutboxConflict } from "../../src/services/outbox"
import { runMobileSync } from "../../src/services/sync-engine"
import { allMediaUploads, flushMediaOutbox } from "../../src/services/media-outbox"
import { flushRouteCommandJournal } from "../../src/services/route-command-journal"
import { pullAndApplySync } from "../../src/services/sync-cache"
import { syncRouteV2Routes } from "../../src/services/sync-v2-routes"
import { queueAttendanceRequest, attendanceScope } from "../../src/services/attendance-requests"
import { guardOfficeAttendance } from "../../src/services/attendance-session-guard"
import { getFieldDeviceId } from "../../src/services/field-device-id"
import { officeAgent, officeBootstrap } from "../../test-support/office-attendance"
const scope = `${officeAgent.organizationId}:${officeAgent.id}`
let data = officeBootstrap()
beforeEach(async () => {
  jest.clearAllMocks(); await AsyncStorage.clear(); setOfflineScope(officeAgent.organizationId, officeAgent.id); data = officeBootstrap()
  ;(useAuthStore.getState as jest.Mock).mockReturnValue({ isLoggedIn: true, agent: officeAgent })
  ;(useBootstrapStore.getState as jest.Mock).mockImplementation(() => ({ routeFieldAccess: "unavailable", data }))
  ;(api.syncPush as jest.Mock).mockImplementation(async operations => ({ results: operations.map((item: {operationId: string}) => ({ operationId: item.operationId, status: "ok" })) }))
  useWorkdayStore.setState({ activeWorkday: null, finishedWorkday: null, hydrated: true, syncError: null })
})
it("sends only own workdays and attendance requests while preserving every other queue byte", async () => {
  const field = await enqueueOutboxOperation({ entity: "visits", op: "create", data: { private: "field fixture" } })
  await useWorkdayStore.getState().start(scope, () => guardOfficeAttendance(scope))
  const input = { clientRequestId: "c01be938-a8bb-41e1-b08b-d1ea2394d0b3", kind: "ANNUAL_LEAVE" as const, unit: "DAYS" as const, startDate: "2026-10-14", endDate: "2026-10-14", reason: "Demo request", attachmentIds: [] }
  await queueAttendanceRequest(attendanceScope(), input, [])
  ;(api.submitAttendanceRequest as jest.Mock).mockResolvedValue({ success: true, data: { request: { id: "request-fixture", ...input, status: "PENDING", submittedAt: "2026-10-13T08:00:00Z", version: "2026-10-13T08:00:00Z", decidedAt: null, decisionNote: null, cancelledAt: null, details: { ...input, startTime: null, endTime: null, timezone: "Asia/Baku" } } } })
  expect((await runMobileSync()).sent).toBe(2)
  expect((api.syncPush as jest.Mock).mock.calls[0][0].map((item: { entity: string }) => item.entity)).toEqual(["workdays"])
  expect(await allOutboxOperations()).toEqual([field])
  for (const fn of [api.syncPull, api.uploadPhoto, allMediaUploads, flushMediaOutbox, flushRouteCommandJournal, pullAndApplySync, syncRouteV2Routes]) expect(fn).not.toHaveBeenCalled()
})
it("retains canonical START/PAUSE/RESUME/FINISH identities and never adds location to any event", async () => {
  const store = useWorkdayStore.getState(); await store.start(scope, () => guardOfficeAttendance(scope))
  const start = (await allOutboxOperations())[0]; await runMobileSync()
  await store.reconcileFromServer(scope, { id: String(start.data.id), status: "STARTED", startedAt: String(start.data.occurredAt) })
  await store.pause(scope, () => guardOfficeAttendance(scope)); await runMobileSync()
  await store.resume(scope, () => guardOfficeAttendance(scope)); await runMobileSync()
  await store.end(scope, () => guardOfficeAttendance(scope)); await runMobileSync()
  const events = (api.syncPush as jest.Mock).mock.calls.flatMap(call => call[0])
  expect(events.map(item => item.data.action)).toEqual(["START", "PAUSE", "RESUME", "FINISH"])
  expect(events.slice(1).every(item => item.data.workdayId === start.data.id)).toBe(true)
  expect(JSON.stringify(events)).not.toMatch(/latitude|longitude/)
  const safeMark = { version: 1, installationId: await getFieldDeviceId(), locationState: "NO_CONSENT", consentRevisionId: null, location: null }
  expect(events[0].data.attendanceMark).toEqual(safeMark)
  expect(events[3].data.attendanceMark).toEqual(safeMark)
  expect(events[1].data.attendanceMark).toBeUndefined()
  expect(events[2].data.attendanceMark).toBeUndefined()
})
it("does not acknowledge or reschedule a late response after scope changes", async () => {
  await useWorkdayStore.getState().start(scope, () => guardOfficeAttendance(scope))
  const original = await allOutboxOperations()
  ;(api.syncPush as jest.Mock).mockImplementation(async operations => { setOfflineScope("other", "other"); return { results: [{ operationId: operations[0].operationId, status: "ok" }] } })
  await expect(runMobileSync()).rejects.toThrow("ATTENDANCE_ACCESS_UNAVAILABLE")
  setOfflineScope(officeAgent.organizationId, officeAgent.id)
  expect(await allOutboxOperations()).toEqual(original)
})
it("pauses revoked grants without deleting their queued evidence", async () => {
  await useWorkdayStore.getState().start(scope, () => guardOfficeAttendance(scope)); const original = await allOutboxOperations()
  data.policies.agentPermissions!.attendanceWorkday = false
  expect((await runMobileSync()).success).toBe(false); expect(api.syncPush).not.toHaveBeenCalled(); expect(await allOutboxOperations()).toEqual(original)
})
it("honestly defers an unknown server outcome and keeps the same operation for retry", async () => {
  await useWorkdayStore.getState().start(scope, () => guardOfficeAttendance(scope)); const original = (await allOutboxOperations())[0]
  ;(api.syncPush as jest.Mock).mockRejectedValueOnce(new Error("lost response"))
  expect((await runMobileSync()).deferred).toBe(1)
  const pending = (await allOutboxOperations())[0]
  expect(pending.operationId).toBe(original.operationId); expect(pending.data).toEqual(original.data); expect(pending.attempts).toBe(1)
  expect(await retryOutboxConflict(pending.operationId)).toBeNull()
})
it("rejects a scope change while persisting START before the new account can receive its event", async () => {
  const original = AsyncStorage.setItem as jest.Mock
  original.mockImplementationOnce(async () => { setOfflineScope("other", "other") })
  await expect(useWorkdayStore.getState().start(scope, () => guardOfficeAttendance(scope))).rejects.toThrow()
  expect(await allOutboxOperations()).toEqual([])
})
