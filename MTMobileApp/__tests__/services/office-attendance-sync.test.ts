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
import { useSyncStatusStore } from "../../src/store/sync-status"
import { useWorkdayStore } from "../../src/store/workday"
import { setOfflineScope } from "../../src/services/offline-scope"
import { enqueueOutboxOperation, allOutboxOperations, retryOutboxConflict, flushOutbox } from "../../src/services/outbox"
import { runMobileSync } from "../../src/services/sync-engine"
import { allMediaUploads, flushMediaOutbox } from "../../src/services/media-outbox"
import { flushRouteCommandJournal } from "../../src/services/route-command-journal"
import { pullAndApplySync } from "../../src/services/sync-cache"
import { syncRouteV2Routes } from "../../src/services/sync-v2-routes"
import { queueAttendanceRequest, attendanceScope, pushAttendanceAndLegacy } from "../../src/services/attendance-requests"
import { readAttendanceReceipts } from "../../src/services/attendance-receipts"
import { guardOfficeAttendance } from "../../src/services/attendance-session-guard"
import { getFieldDeviceId } from "../../src/services/field-device-id"
import { officeAgent, officeBootstrap } from "../../test-support/office-attendance"
const scope = `${officeAgent.organizationId}:${officeAgent.id}`
let data = officeBootstrap()
beforeEach(async () => {
  useSyncStatusStore.getState().setOnline(true)
  jest.clearAllMocks(); await AsyncStorage.clear(); setOfflineScope(officeAgent.organizationId, officeAgent.id); data = officeBootstrap()
  ;(useAuthStore.getState as jest.Mock).mockReturnValue({ isLoggedIn: true, agent: officeAgent, serverDomain: 'fixture.invalid' })
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
it('retains an accepted mark until its receipt is durable, then replays without duplicate receipts', async () => {
  const original = await enqueueOutboxOperation({ entity: 'workdays', op: 'create', data: { action: 'START', id: 'receipt-day', occurredAt: '2026-10-22T05:00:00Z' } })
  ;(api.syncPush as jest.Mock).mockImplementation(async operations => ({ results: operations.map((item: typeof original) => ({ operationId: item.operationId, status: 'ok', serverData: {
    event: { id: 'receipt-event', workdayId: 'receipt-day', clientEventId: item.operationId, type: 'START', claimedAt: item.data.occurredAt, serverReceivedAt: '2026-10-22T05:01:00Z' }, review: { state: 'NOT_REQUIRED' },
  } })) }))
  const set = AsyncStorage.setItem as jest.Mock, persist = set.getMockImplementation()!
  let fail = true
  set.mockImplementation(async (key, value) => {
    if (key.startsWith('@mtm_attendance_delivery') && fail) { fail = false; throw new Error('receipt disk failure') }
    return persist(key, value)
  })
  try {
    expect((await runMobileSync()).deferred).toBe(1)
    expect((await allOutboxOperations())[0]).toMatchObject({ operationId: original.operationId, data: original.data })
    expect(await readAttendanceReceipts({ scope, server: 'fixture.invalid' })).toEqual([])
    const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 120_000)
    try { expect((await flushOutbox(pushAttendanceAndLegacy, { orderedWorkdays: true })).sent).toBe(1) }
    finally { clock.mockRestore() }
    expect(await allOutboxOperations()).toEqual([])
    expect(await readAttendanceReceipts({ scope, server: 'fixture.invalid' })).toHaveLength(1)
    expect((api.syncPush as jest.Mock).mock.calls.map(call => call[0][0].operationId)).toEqual([original.operationId, original.operationId])
  } finally { set.mockImplementation(persist) }
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

it("records an entire disconnected shift, reconstructs after a lost UI snapshot and drains one event at a time", async () => {
  const store = useWorkdayStore.getState()
  data.attendanceOffline = { verifiedAt: Date.now(), lastSeenAt: Date.now(), validUntil: Date.now() + 86400000, installation: null, location: null }
  // Use one timestamp for the exact policy duration.
  data.attendanceOffline.validUntil = data.attendanceOffline.verifiedAt + 86400000
  await store.start(scope, () => guardOfficeAttendance(scope))
  await store.pause(scope, () => guardOfficeAttendance(scope))
  await store.resume(scope, () => guardOfficeAttendance(scope))
  await store.end(scope, () => guardOfficeAttendance(scope))
  const original = await allOutboxOperations()
  expect(original.map(row => row.data.action)).toEqual(['START', 'PAUSE', 'RESUME', 'FINISH'])
  await runMobileSync(); expect(api.syncPush).not.toHaveBeenCalled()
  // Crash after durable enqueue but before saving the separate view projection.
  await AsyncStorage.removeItem('@mtm_active_workday_v1')
  useWorkdayStore.setState({ activeWorkday: null, hydrated: false })
  await store.hydrate(); await store.reconcileFromServer(scope, null, () => guardOfficeAttendance(scope))
  expect(useWorkdayStore.getState().activeWorkday).toMatchObject({ workdayId: original[0].data.id, syncState: 'FINISH_PENDING' })
  await store.start(scope, () => guardOfficeAttendance(scope)); await store.end(scope, () => guardOfficeAttendance(scope))
  expect(await allOutboxOperations()).toEqual(original)
  delete data.attendanceOffline
  expect((await runMobileSync()).sent).toBe(4)
  expect((api.syncPush as jest.Mock).mock.calls.map(call => call[0].length)).toEqual([1, 1, 1, 1])
  expect((api.syncPush as jest.Mock).mock.calls.map(call => call[0][0].operationId)).toEqual(original.map(row => row.operationId))
  expect((api.syncPush as jest.Mock).mock.calls.map(call => call[0][0].data)).toEqual(original.map(row => row.data))
  expect(await allOutboxOperations()).toEqual([])
})
it("a lost START response blocks dependent events until exact replay, then sends each just once", async () => {
  jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-21T08:00:00Z'))
  try {
    const store = useWorkdayStore.getState()
    await store.start(scope, () => guardOfficeAttendance(scope)); await store.pause(scope, () => guardOfficeAttendance(scope))
    await store.resume(scope, () => guardOfficeAttendance(scope)); await store.end(scope, () => guardOfficeAttendance(scope))
    const original = await allOutboxOperations(), accepted = new Set<string>()
    let loseReply = true
    ;(api.syncPush as jest.Mock).mockImplementation(async operations => {
      expect(operations).toHaveLength(1); const op = operations[0]
      accepted.add(op.operationId)
      if (loseReply) { loseReply = false; throw new Error('accepted, response lost') }
      return { results: [{ operationId: op.operationId, status: 'ok' }] }
    })
    expect((await runMobileSync()).deferred).toBe(4)
    expect(api.syncPush).toHaveBeenCalledTimes(1)
    await runMobileSync(); expect(api.syncPush).toHaveBeenCalledTimes(1)
    expect((await allOutboxOperations()).map(row => row.data)).toEqual(original.map(row => row.data))
    jest.setSystemTime(Date.now() + 120000)
    expect((await runMobileSync()).sent).toBe(4)
    expect(accepted.size).toBe(4)
    expect((api.syncPush as jest.Mock).mock.calls.map(call => call[0][0].data.action)).toEqual(['START', 'START', 'PAUSE', 'RESUME', 'FINISH'])
    expect(await allOutboxOperations()).toEqual([])
  } finally { jest.useRealTimers() }
})
it("retains the full claimed sequence and stops after a rejected predecessor", async () => {
  const store = useWorkdayStore.getState()
  await store.start(scope, () => guardOfficeAttendance(scope)); await store.pause(scope, () => guardOfficeAttendance(scope))
  await store.resume(scope, () => guardOfficeAttendance(scope)); await store.end(scope, () => guardOfficeAttendance(scope))
  const original = await allOutboxOperations()
  ;(api.syncPush as jest.Mock).mockImplementation(async operations => ({ results: [{ operationId: operations[0].operationId, status: 'conflict', error: 'MTM_WORKDAY_ALREADY_EXISTS' }] }))
  expect((await runMobileSync()).conflicted).toBe(1); expect(api.syncPush).toHaveBeenCalledTimes(1)
  await runMobileSync(); expect(api.syncPush).toHaveBeenCalledTimes(1)
  await store.reconcileFromServer(scope, null, () => guardOfficeAttendance(scope))
  expect(useWorkdayStore.getState().activeWorkday?.syncState).toBe('FINISH_PENDING')
  expect((await allOutboxOperations()).map(row => row.data)).toEqual(original.map(row => row.data))
  await expect(store.start(scope, () => guardOfficeAttendance(scope))).rejects.toThrow('ATTENDANCE_QUEUE_CONFLICT')
})

it('does not capture using stale live admission after loss of connectivity', async () => {
  useSyncStatusStore.getState().setOnline(false)
  await expect(useWorkdayStore.getState().start(scope, () => guardOfficeAttendance(scope))).rejects.toThrow('ATTENDANCE_ACCESS_UNAVAILABLE')
  expect(await allOutboxOperations()).toEqual([])
  data.attendanceOffline = { verifiedAt: Date.now(), lastSeenAt: Date.now(), validUntil: Date.now() + 86400000, installation: null, location: null }
  // Use one exact clock instant to avoid a test boundary across Date.now calls.
  data.attendanceOffline.lastSeenAt = data.attendanceOffline.verifiedAt
  data.attendanceOffline.validUntil = data.attendanceOffline.verifiedAt + 86400000
  await useWorkdayStore.getState().start(scope, () => guardOfficeAttendance(scope))
  expect((await allOutboxOperations()).map(row => row.data.action)).toEqual(['START'])
})
