import AsyncStorage from "@react-native-async-storage/async-storage"
import { applySyncChanges, clearSyncCache, pullAndApplySync, readSyncCache } from "../../src/services/sync-cache"

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)

describe("scoped durable sync cache", () => {
  beforeEach(async () => {
    await AsyncStorage.clear()
  })

  it("merges updates and removes tombstones", async () => {
    await applySyncChanges("tenant-a", "agent-a", {
      customers: { updated: [{ id: "c1", name: "Old" }, { id: "c2", name: "Keep" }] },
    }, "v1")
    const state = await applySyncChanges("tenant-a", "agent-a", {
      customers: { updated: [{ id: "c1", name: "New" }], deleted: ["c2"] },
    }, "v2")
    expect(state.version).toBe("v2")
    expect(state.entities.customers).toEqual([{ id: "c1", name: "New" }])
    expect((await readSyncCache("tenant-b", "agent-a")).entities).toEqual({})
  })

  it("uses the persisted cursor for delta pulls", async () => {
    await applySyncChanges("tenant-a", "agent-a", { tasks: { updated: [{ id: "t1" }] } }, "cursor-1")
    const pull = jest.fn().mockResolvedValue({ timestamp: "cursor-2", changes: { tasks: { updated: [{ id: "t2" }] } } })
    const state = await pullAndApplySync("tenant-a", "agent-a", pull)
    expect(pull).toHaveBeenCalledWith("cursor-1")
    expect(state.entities.tasks?.map((task) => task.id)).toEqual(["t1", "t2"])
  })

  it("clears only the selected tenant/user scope", async () => {
    await applySyncChanges("tenant-a", "agent-a", { visits: { updated: [{ id: "v1" }] } }, "v1")
    await applySyncChanges("tenant-b", "agent-a", { visits: { updated: [{ id: "v2" }] } }, "v1")
    await clearSyncCache("tenant-a", "agent-a")
    expect((await readSyncCache("tenant-a", "agent-a")).entities).toEqual({})
    expect((await readSyncCache("tenant-b", "agent-a")).entities.visits).toEqual([{ id: "v2" }])
  })
})
