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

  it("returns the new id so a waiting screen can follow the retry (audit T1)", async () => {
    // The screen that offered "Повторить" waits for THIS operation's outcome.
    // Without the new id it waits on the dead one, reads the pinned conflict
    // again and shows the same dialog — which is what the agent saw.
    await enqueueOutboxOperation({ entity: "visits", op: "create", data: { id: "visit-1" } })
    const [item] = await pendingOutboxOperations()
    await flushOutbox(async () => ({
      results: [{ operationId: item.operationId, status: "conflict", error: "server exploded" }],
    }))

    const nextId = await retryOutboxConflict(item.operationId)

    expect(nextId).not.toBeNull()
    expect(nextId).not.toBe(item.operationId)
    const pending = await pendingOutboxOperations()
    expect(pending).toHaveLength(1)
    expect(pending[0].operationId).toBe(nextId)
    expect(await conflictOutboxOperations()).toEqual([])
  })

  it("returns null when there is nothing to retry", async () => {
    // A row already sent, belonging to another tenant, or never rejected: the
    // caller must not then wait on an id that was never queued.
    expect(await retryOutboxConflict("never-existed")).toBeNull()
    await enqueueOutboxOperation({ entity: "visits", op: "create", data: { id: "visit-2" } })
    const [pendingItem] = await pendingOutboxOperations()
    expect(await retryOutboxConflict(pendingItem.operationId)).toBeNull()
    expect((await pendingOutboxOperations())[0].operationId).toBe(pendingItem.operationId)
  })

  it("puts the retried operation back in the queue that flushOutbox actually sends", async () => {
    // The heart of the bug: flushOutbox reads pending rows only, so a rejected
    // row was invisible to every later sync no matter how often it ran.
    await enqueueOutboxOperation({ entity: "visits", op: "create", data: { id: "visit-3" } })
    const [item] = await pendingOutboxOperations()
    await flushOutbox(async () => ({
      results: [{ operationId: item.operationId, status: "conflict", error: "server exploded" }],
    }))

    const sentWhileConflicted: string[] = []
    await flushOutbox(async (operations) => {
      sentWhileConflicted.push(...operations.map((operation) => operation.operationId))
      return { results: [] }
    })
    expect(sentWhileConflicted).toEqual([])

    const nextId = await retryOutboxConflict(item.operationId)
    const sentAfterRetry: string[] = []
    await flushOutbox(async (operations) => {
      sentAfterRetry.push(...operations.map((operation) => operation.operationId))
      return { results: operations.map((operation) => ({ operationId: operation.operationId, status: "ok" as const })) }
    })
    expect(sentAfterRetry).toEqual([nextId])
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

  it("honours server Retry-After without clearing the durable operation", async () => {
    const item = await enqueueOutboxOperation({ entity: "visits", op: "update", data: { id: "v1" } })
    const error = Object.assign(new Error("temporarily unavailable"), { retryAfterMs: 5_000 })

    const result = await flushOutbox(
      async () => { throw error },
      { now: () => 1_000, random: () => 0 },
    )

    expect(result).toMatchObject({ sent: 0, deferred: 1, conflicted: 0, retryAfterMs: 5_000 })
    expect(await pendingOutboxOperations(5_999)).toEqual([])
    expect((await pendingOutboxOperations(6_000)).map((entry) => entry.operationId)).toEqual([item.operationId])
  })

  it("preserves the legacy retry schedule when transport gives no Retry-After", async () => {
    const item = await enqueueOutboxOperation({ entity: "visits", op: "update", data: { id: "v1" } })

    const result = await flushOutbox(
      async () => { throw new Error("temporarily unavailable") },
      { now: () => 1_000, random: () => 1 },
    )

    expect(result).toMatchObject({ sent: 0, deferred: 1, conflicted: 0, error: "temporarily unavailable" })
    expect(await pendingOutboxOperations(2_999)).toEqual([])
    expect((await pendingOutboxOperations(3_000)).map((entry) => entry.operationId)).toEqual([item.operationId])
  })

  it("can clear persisted operations", async () => {
    await enqueueOutboxOperation({ entity: "workdays", op: "create", data: { id: "w1" } })
    await clearOutbox()
    expect(await pendingOutboxOperations()).toEqual([])
  })
})
