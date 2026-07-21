import AsyncStorage from "@react-native-async-storage/async-storage"
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)
import {
  acknowledgeOutboxOperation,
  clearOutbox,
  deferOutboxOperation,
  enqueueOutboxOperation,
  pendingOutboxOperations,
  conflictOutboxOperations,
  flushOutbox,
  retryOutboxConflict,
} from "../../src/services/outbox"
import { setOfflineScope } from "../../src/services/offline-scope"

describe("durable sync outbox", () => {
  beforeEach(async () => {
    await AsyncStorage.clear()
    setOfflineScope("org-1", "agent-1")
  })

  it("isolates queued operations by tenant and user", async () => {
    await enqueueOutboxOperation({ entity: "tasks", op: "update", data: { id: "tenant-a" } })
    setOfflineScope("org-2", "agent-2")
    expect(await pendingOutboxOperations()).toEqual([])
    await enqueueOutboxOperation({ entity: "tasks", op: "update", data: { id: "tenant-b" } })
    expect((await pendingOutboxOperations()).map((item) => item.data.id)).toEqual(["tenant-b"])
    setOfflineScope("org-1", "agent-1")
    expect((await pendingOutboxOperations()).map((item) => item.data.id)).toEqual(["tenant-a"])
  })

  it("keeps server conflicts durably and retries only after user action", async () => {
    const item = await enqueueOutboxOperation({ entity: "visits", op: "create", data: { id: "v1" } })
    const first = await flushOutbox(async () => ({
      results: [{
        operationId: item.operationId,
        status: "conflict",
        error: "Outside geofence",
        serverData: { code: "MTM_VISIT_OUT_OF_ZONE", distanceMeters: 300 },
      }],
    }))
    expect(first).toEqual({ sent: 0, deferred: 0, conflicted: 1 })
    expect(await pendingOutboxOperations()).toEqual([])
    expect(await conflictOutboxOperations()).toEqual([
      expect.objectContaining({
        operationId: item.operationId,
        status: "conflict",
        conflict: expect.objectContaining({
          error: "Outside geofence",
          serverData: { code: "MTM_VISIT_OUT_OF_ZONE", distanceMeters: 300 },
        }),
      }),
    ])

    await retryOutboxConflict(item.operationId, { checkInLat: 40.4, checkInLng: 49.8 })
    expect(await conflictOutboxOperations()).toEqual([])
    const retried = await pendingOutboxOperations()
    expect(retried).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({ checkInLat: 40.4, checkInLng: 49.8 }),
      }),
    ])
    expect(retried[0].operationId).not.toBe(item.operationId)
  })

  it("persists operations and acknowledges them by id", async () => {
    const item = await enqueueOutboxOperation({ entity: "visits", op: "create", data: { id: "v1" } })
    expect((await pendingOutboxOperations()).map((entry) => entry.operationId)).toEqual([item.operationId])
    await acknowledgeOutboxOperation(item.operationId)
    expect(await pendingOutboxOperations()).toEqual([])
  })

  it("defers retries with exponential backoff", async () => {
    const item = await enqueueOutboxOperation({ entity: "tasks", op: "update", data: { id: "t1" } })
    await deferOutboxOperation(item.operationId, 1_000)
    expect(await pendingOutboxOperations(2_000)).toEqual([])
    expect((await pendingOutboxOperations(4_000))[0].attempts).toBe(1)
  })

  it("can clear persisted operations", async () => {
    await enqueueOutboxOperation({ entity: "workdays", op: "create", data: { id: "w1" } })
    await clearOutbox()
    expect(await pendingOutboxOperations()).toEqual([])
  })
})
