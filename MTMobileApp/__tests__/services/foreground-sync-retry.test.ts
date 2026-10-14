import AsyncStorage from "@react-native-async-storage/async-storage"
import { AppState } from "react-native"
jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"))
jest.mock("react-native", () => ({ AppState: { currentState: "active", addEventListener: jest.fn() } }))
jest.mock("../../src/services/api", () => ({ api: { syncPush: jest.fn(), syncPull: jest.fn(), uploadPhoto: jest.fn() } }))
jest.mock("../../src/store/auth", () => ({ useAuthStore: require("zustand").create(() => ({})) }))
jest.mock("../../src/store/bootstrap", () => ({ useBootstrapStore: require("zustand").create(() => ({})) }))
jest.mock("../../src/store/workday", () => ({ useWorkdayStore: { getState: () => ({ hydrate: jest.fn(async () => {}), reconcileFromServer: jest.fn(async () => {}) }) }, workdayKey: (org: string, agent: string) => `${org}:${agent}` }))
jest.mock("../../src/services/route-command-journal", () => ({ allRouteCommandJournalEntries: jest.fn(async () => []), flushRouteCommandJournal: jest.fn(async () => ({ sent: 0, deferred: 0, conflicted: 0, acknowledgements: [] })) }))
jest.mock("../../src/services/media-outbox", () => ({ allMediaUploads: jest.fn(async () => []), flushMediaOutbox: jest.fn(async () => ({ sent: 0, deferred: 0 })) }))
jest.mock("../../src/services/sync-cache", () => ({ pullAndApplySync: jest.fn(async () => {}) }))
jest.mock("../../src/services/sync-v2-routes", () => ({ clearRouteV2RoutesState: jest.fn(async () => {}), syncRouteV2Routes: jest.fn() }))
import { api } from "../../src/services/api"
import { useAuthStore } from "../../src/store/auth"
import { useBootstrapStore } from "../../src/store/bootstrap"
import { useSyncStatusStore } from "../../src/store/sync-status"
import { setOfflineScope, clearOfflineScope } from "../../src/services/offline-scope"
import { enqueueOutboxOperation, deferOutboxOperation, allOutboxOperations, markOutboxConflict } from "../../src/services/outbox"
import { startForegroundSyncRetry } from "../../src/services/foreground-sync-retry"
import { officeAgent, officeBootstrap } from "../../test-support/office-attendance"

const scope = `${officeAgent.organizationId}:${officeAgent.id}`
const callbacks = new Set<(state: string) => void>()
let stop: (() => void) | undefined
const fetchBootstrap = jest.fn()
const send = api.syncPush as jest.Mock
const enqueue = (entity = "workdays") => enqueueOutboxOperation({ entity, op: "create", data: { action: "START", id: "fictional-day" } })
function lifecycle(state: string) {
  (AppState as { currentState: string }).currentState = state
  for (const callback of callbacks) callback(state)
}
const settle = () => jest.advanceTimersByTimeAsync(0)

beforeEach(async () => {
  jest.useFakeTimers(); jest.setSystemTime(new Date("2026-10-14T01:00:00Z")); jest.clearAllMocks()
  jest.spyOn(Math, "random").mockReturnValue(0)
  callbacks.clear(); lifecycle("active"); await AsyncStorage.clear()
  ;(AppState.addEventListener as jest.Mock).mockImplementation((_event, callback) => { callbacks.add(callback); return { remove: () => callbacks.delete(callback) } })
  setOfflineScope(officeAgent.organizationId, officeAgent.id)
  useAuthStore.setState({ isLoggedIn: true, isLoading: false, serverDomain: "fictional.invalid", agent: { ...officeAgent, role: "AGENT", email: "fixture@example.invalid", organizationName: "Fictional" } })
  fetchBootstrap.mockResolvedValue("enabled")
  useBootstrapStore.setState({ data: officeBootstrap("AGENT"), routeFieldAccess: "enabled", loading: false, fetchBootstrap })
  useSyncStatusStore.getState().clear(); await useSyncStatusStore.getState().hydrate(scope); useSyncStatusStore.getState().setOnline(true)
  send.mockImplementation(async operations => ({ results: operations.map((op: { operationId: string }) => ({ operationId: op.operationId, status: "ok" })) }))
})
afterEach(() => { stop?.(); stop = undefined; jest.restoreAllMocks(); jest.useRealTimers() })

it("wakes at the later durable/pipeline deadline and uses actual sync acknowledgement once", async () => {
  const row = await enqueue()
  await deferOutboxOperation(row.operationId)
  await useSyncStatusStore.getState().deferPipeline({ scopeKey: scope, pipeline: "routeOutbox", error: "fixture", retryAfterMs: 10_000, random: () => 0 })
  stop = startForegroundSyncRetry(); await settle()
  await jest.advanceTimersByTimeAsync(9_999); expect(send).not.toHaveBeenCalled()
  await jest.advanceTimersByTimeAsync(1)
  expect(send).toHaveBeenCalledTimes(1); expect(fetchBootstrap).toHaveBeenCalledTimes(2)
  expect(await allOutboxOperations()).toEqual([])
  expect(send.mock.calls[0][0][0].operationId).toBe(row.operationId)
  await jest.advanceTimersByTimeAsync(60_000); expect(send).toHaveBeenCalledTimes(1)
})

it.each(["offline", "background", "logout", "scope", "role", "withdrawal"])("cancels a scheduled attempt on %s without changing its queue", async reason => {
  const row = await enqueue(); await deferOutboxOperation(row.operationId)
  const before = await allOutboxOperations()
  stop = startForegroundSyncRetry(); await settle()
  if (reason === "offline") useSyncStatusStore.getState().setOnline(false)
  if (reason === "background") lifecycle("background")
  if (reason === "logout") { clearOfflineScope(); useAuthStore.setState({ isLoggedIn: false, agent: null }) }
  if (reason === "scope") { setOfflineScope("other", "other"); useAuthStore.setState({ agent: { ...useAuthStore.getState().agent!, id: "other", organizationId: "other" } }) }
  if (reason === "role") useAuthStore.setState({ agent: { ...useAuthStore.getState().agent!, role: "EMPLOYEE" } })
  if (reason === "withdrawal") useBootstrapStore.setState({ routeFieldAccess: "disabled", data: null })
  await jest.advanceTimersByTimeAsync(60_000)
  expect(send).not.toHaveBeenCalled(); expect(fetchBootstrap).not.toHaveBeenCalled()
  setOfflineScope(officeAgent.organizationId, officeAgent.id)
  expect(await allOutboxOperations()).toEqual(before)
})

it("resumes a due deadline on foreground/online return without an explicit sync action", async () => {
  await enqueue(); lifecycle("background"); useSyncStatusStore.getState().setOnline(false)
  stop = startForegroundSyncRetry(); await settle(); await jest.advanceTimersByTimeAsync(60_000)
  expect(send).not.toHaveBeenCalled()
  lifecycle("active"); useSyncStatusStore.getState().setOnline(true); await settle()
  await jest.advanceTimersByTimeAsync(250)
  expect(send).toHaveBeenCalledTimes(1); expect(await allOutboxOperations()).toEqual([])
})

it("arms a newly persisted queue and schedules the next real backoff without an eager retry", async () => {
  stop = startForegroundSyncRetry(); await settle()
  send.mockImplementationOnce(async operations => ({ results: operations.map((op: { operationId: string }) => ({ operationId: op.operationId, status: "error" })) }))
  const row = await enqueue(); await settle(); await jest.advanceTimersByTimeAsync(250)
  expect(send).toHaveBeenCalledTimes(1)
  const pending = (await allOutboxOperations())[0]
  expect(pending.operationId).toBe(row.operationId); expect(pending.attempts).toBe(1)
  const next = Math.max(pending.nextAttemptAt, useSyncStatusStore.getState().pipelines.routeOutbox.retryAt ?? 0)
  await jest.advanceTimersByTimeAsync(next - Date.now() - 1); expect(send).toHaveBeenCalledTimes(1)
  await jest.advanceTimersByTimeAsync(1); expect(send).toHaveBeenCalledTimes(2)
  expect(await allOutboxOperations()).toEqual([])
})

it("stays quiet while refused and reconsiders once when admission genuinely recovers", async () => {
  await enqueue()
  fetchBootstrap.mockImplementation(async () => { useBootstrapStore.setState({ data: null, routeFieldAccess: "disabled" }); return "disabled" })
  stop = startForegroundSyncRetry(); await settle(); await jest.advanceTimersByTimeAsync(250)
  expect(fetchBootstrap).toHaveBeenCalledTimes(1); expect(send).not.toHaveBeenCalled()
  await jest.advanceTimersByTimeAsync(30 * 60_000)
  expect(fetchBootstrap).toHaveBeenCalledTimes(1); expect(await allOutboxOperations()).toHaveLength(1)
  fetchBootstrap.mockResolvedValue("enabled")
  useBootstrapStore.setState({ data: officeBootstrap("AGENT"), routeFieldAccess: "enabled" })
  await settle(); await jest.advanceTimersByTimeAsync(250)
  expect(send).toHaveBeenCalledTimes(1); expect(fetchBootstrap).toHaveBeenCalledTimes(3)
  expect(await allOutboxOperations()).toEqual([])
  await jest.advanceTimersByTimeAsync(30 * 60_000); expect(fetchBootstrap).toHaveBeenCalledTimes(3)
})

it("does not rearm an unchanged failed continuation for loading flags alone", async () => {
  await enqueue(); fetchBootstrap.mockRejectedValue(new Error("fictional refresh unavailable"))
  stop = startForegroundSyncRetry(); await settle(); await jest.advanceTimersByTimeAsync(250)
  expect(fetchBootstrap).toHaveBeenCalledTimes(1)
  useBootstrapStore.setState({ loading: true }); await settle()
  useBootstrapStore.setState({ loading: false }); await settle()
  await jest.advanceTimersByTimeAsync(30 * 60_000)
  expect(fetchBootstrap).toHaveBeenCalledTimes(1); expect(send).not.toHaveBeenCalled()
})

it("cancels a late bootstrap continuation and never overlaps while that read is pending", async () => {
  await enqueue()
  let release!: (value: string) => void
  fetchBootstrap.mockImplementationOnce(() => new Promise<string>(resolve => { release = resolve }))
  stop = startForegroundSyncRetry(); await settle(); await jest.advanceTimersByTimeAsync(250)
  useSyncStatusStore.getState().updateCounts({ pending: 1, conflicts: 0, mediaPending: 0 })
  await jest.advanceTimersByTimeAsync(60_000); expect(fetchBootstrap).toHaveBeenCalledTimes(1)
  lifecycle("background"); release("enabled"); await settle()
  expect(send).not.toHaveBeenCalled(); expect(await allOutboxOperations()).toHaveLength(1)
  lifecycle("active"); await settle(); await jest.advanceTimersByTimeAsync(250)
  expect(send).toHaveBeenCalledTimes(1)
})

it.each(["offline", "logout", "scope", "role"])("fences %s while bootstrap is in flight before any outbox transport", async reason => {
  await enqueue()
  const before = await allOutboxOperations()
  let release!: (value: string) => void
  fetchBootstrap.mockImplementationOnce(() => new Promise<string>(resolve => { release = resolve }))
  stop = startForegroundSyncRetry(); await settle(); await jest.advanceTimersByTimeAsync(250)
  if (reason === "offline") useSyncStatusStore.getState().setOnline(false)
  if (reason === "logout") { clearOfflineScope(); useAuthStore.setState({ isLoggedIn: false, agent: null }) }
  if (reason === "scope") { setOfflineScope("other", "other"); useAuthStore.setState({ agent: { ...useAuthStore.getState().agent!, id: "other", organizationId: "other" } }) }
  if (reason === "role") useAuthStore.setState({ agent: { ...useAuthStore.getState().agent!, role: "EMPLOYEE" } })
  release("enabled"); await settle(); await jest.advanceTimersByTimeAsync(60_000)
  expect(send).not.toHaveBeenCalled(); expect(fetchBootstrap).toHaveBeenCalledTimes(1)
  setOfflineScope(officeAgent.organizationId, officeAgent.id)
  expect(await allOutboxOperations()).toEqual(before)
})

it("ignores conflicts, unknown connectivity, cross-principal bootstrap and disposed timers", async () => {
  const row = await enqueue(); await markOutboxConflict(row.operationId, { operationId: row.operationId, status: "conflict" })
  stop = startForegroundSyncRetry(); await settle(); await jest.advanceTimersByTimeAsync(60_000)
  expect(send).not.toHaveBeenCalled()
  await enqueue(); useSyncStatusStore.getState().setOnline(null); await settle(); await jest.advanceTimersByTimeAsync(60_000)
  expect(send).not.toHaveBeenCalled()
  useSyncStatusStore.getState().setOnline(true)
  const data = officeBootstrap("AGENT"); data.manifest!.principal.id = "other-principal"
  useBootstrapStore.setState({ data }); await settle(); await jest.advanceTimersByTimeAsync(60_000)
  expect(send).not.toHaveBeenCalled()
  useBootstrapStore.setState({ data: officeBootstrap("AGENT") }); await settle(); stop(); await jest.advanceTimersByTimeAsync(60_000)
  expect(send).not.toHaveBeenCalled(); expect(callbacks.size).toBe(0)
})

it("retries office workdays from any screen while leaving field entries and field pipelines alone", async () => {
  useAuthStore.setState({ agent: { ...useAuthStore.getState().agent!, role: "EMPLOYEE" } })
  useBootstrapStore.setState({ data: officeBootstrap(), routeFieldAccess: "unavailable" })
  fetchBootstrap.mockResolvedValue("unavailable")
  const field = await enqueue("visits"); await jest.advanceTimersByTimeAsync(1); const office = await enqueue()
  await deferOutboxOperation(office.operationId)
  stop = startForegroundSyncRetry(); await settle(); await jest.advanceTimersByTimeAsync(1_999)
  expect(send).not.toHaveBeenCalled(); await jest.advanceTimersByTimeAsync(1)
  expect(send).toHaveBeenCalledTimes(1)
  expect(send.mock.calls[0][0].map((row: { entity: string }) => row.entity)).toEqual(["workdays"])
  expect(await allOutboxOperations()).toEqual([field]); expect(api.syncPull).not.toHaveBeenCalled()
  await jest.advanceTimersByTimeAsync(60_000); expect(send).toHaveBeenCalledTimes(1)
})
