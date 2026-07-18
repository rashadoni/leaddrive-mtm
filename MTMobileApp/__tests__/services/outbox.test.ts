import AsyncStorage from "@react-native-async-storage/async-storage"
import {
  acknowledgeOutboxOperation,
  clearOutbox,
  deferOutboxOperation,
  enqueueOutboxOperation,
  pendingOutboxOperations,
} from "../../src/services/outbox"

describe("durable sync outbox", () => {
  beforeEach(async () => {
    await AsyncStorage.clear()
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
