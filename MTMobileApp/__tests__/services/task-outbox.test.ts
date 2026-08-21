import AsyncStorage from "@react-native-async-storage/async-storage"
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)
import { enqueueOutboxOperation, flushOutbox, markOutboxConflict } from "../../src/services/outbox"
import { countPendingTaskUpdates, queueTaskStatusUpdate } from "../../src/services/task-outbox"
import az from "../../src/i18n/locales/az.json"
import en from "../../src/i18n/locales/en.json"
import ru from "../../src/i18n/locales/ru.json"
import { setOfflineScope } from "../../src/services/offline-scope"

describe("durable task mutations", () => {
  beforeEach(async () => {
    await AsyncStorage.clear()
    setOfflineScope("org-1", "agent-1")
  })

  it("queues a task status update as a sync-push operation", async () => {
    const op = await queueTaskStatusUpdate("t1", "IN_PROGRESS")
    expect(op.entity).toBe("tasks")
    expect(op.op).toBe("update")
    expect(op.data).toEqual({ id: "t1", status: "IN_PROGRESS" })
    expect(op.operationId).toBeTruthy()
  })

  it("includes the result note only when provided and non-empty", async () => {
    const withNote = await queueTaskStatusUpdate("t1", "COMPLETED", "done well")
    expect(withNote.data).toEqual({ id: "t1", status: "COMPLETED", result: "done well" })
    const emptyNote = await queueTaskStatusUpdate("t2", "COMPLETED", "")
    expect(emptyNote.data).toEqual({ id: "t2", status: "COMPLETED" })
  })

  it("counts only queued task operations", async () => {
    await queueTaskStatusUpdate("t1", "IN_PROGRESS")
    await queueTaskStatusUpdate("t2", "COMPLETED", "x")
    await enqueueOutboxOperation({ entity: "workdays", op: "create", data: { id: "w1" } })
    expect(await countPendingTaskUpdates()).toBe(2)
  })

  it("flushes queued task updates through the sender and clears them on ack", async () => {
    const op = await queueTaskStatusUpdate("t1", "IN_PROGRESS")
    const send = jest.fn().mockResolvedValue({ results: [{ operationId: op.operationId, status: "ok" }] })
    const result = await flushOutbox(send)
    expect(send).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ sent: 1, deferred: 0, conflicted: 0 })
    expect(await countPendingTaskUpdates()).toBe(0)
  })

  it("keeps the queued update when the sender is offline (deferred)", async () => {
    await queueTaskStatusUpdate("t1", "COMPLETED", "note")
    const send = jest.fn().mockRejectedValue(new Error("Network request failed"))
    const result = await flushOutbox(send)
    expect(result.sent).toBe(0)
    expect(result.deferred).toBe(1)
    // still persisted for the next lifecycle flush
    expect(await countPendingTaskUpdates()).toBe(1)
  })

  it("does not describe a conflicted task update as waiting to send", async () => {
    const op = await queueTaskStatusUpdate("t1", "IN_PROGRESS")
    await markOutboxConflict(op.operationId, {
      operationId: op.operationId,
      status: "conflict",
      error: "Task changed elsewhere",
    })
    expect(await countPendingTaskUpdates()).toBe(0)
  })

  it.each([["en", en], ["ru", ru], ["az", az]])(
    "task.pendingSyncTemplate carries the {{n}} placeholder in %s",
    (_lang, locale) => {
      const value = (locale as { task: { pendingSyncTemplate?: unknown } }).task.pendingSyncTemplate
      expect(typeof value).toBe("string")
      expect(value as string).toContain("{{n}}")
    },
  )
})
