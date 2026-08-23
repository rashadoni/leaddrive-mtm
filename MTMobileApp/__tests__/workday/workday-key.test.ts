jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)
jest.mock("../../src/services/outbox", () => ({
  allOutboxOperations: jest.fn().mockResolvedValue([]),
  enqueueOutboxOperation: jest.fn().mockResolvedValue(undefined),
}))

import AsyncStorage from "@react-native-async-storage/async-storage"
import { setOfflineScope } from "../../src/services/offline-scope"
import { enqueueOutboxOperation } from "../../src/services/outbox"
import { useWorkdayStore, workdayKey } from "../../src/store/workday"

const STORAGE_KEY = "@mtm_active_workday_v1"

describe("workday identity", () => {
  beforeEach(async () => {
    await AsyncStorage.clear()
    jest.clearAllMocks()
    setOfflineScope("tenant-a", "agent-a")
    useWorkdayStore.setState({ activeWorkday: null, syncError: null, hydrated: false })
  })

  it("isolates an active workday by tenant and user", () => {
    expect(workdayKey("tenant-a", "agent-a")).toBe("tenant-a:agent-a")
    expect(workdayKey("tenant-a", "agent-a")).not.toBe(workdayKey("tenant-b", "agent-a"))
    expect(workdayKey("tenant-a", "agent-a")).not.toBe(workdayKey("tenant-a", "agent-b"))
  })

  it("uses explicit safe placeholders for missing identity", () => {
    expect(workdayKey(null, undefined)).toBe("unknown-tenant:unknown-user")
  })

  it("publishes start and end state only after persistence succeeds", async () => {
    await useWorkdayStore.getState().start("tenant-a:agent-a")
    expect(useWorkdayStore.getState().activeWorkday?.key).toBe("tenant-a:agent-a")
    expect(useWorkdayStore.getState().activeWorkday?.syncState).toBe("START_PENDING")
    expect(await AsyncStorage.getItem(STORAGE_KEY)).not.toBeNull()

    await useWorkdayStore.getState().end("tenant-a:agent-a")
    expect(useWorkdayStore.getState().activeWorkday?.syncState).toBe("FINISH_PENDING")
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toContain("FINISH_PENDING")
  })

  it("uses the server's FINISH action when ending a workday", async () => {
    await useWorkdayStore.getState().start("tenant-a:agent-a")
    await useWorkdayStore.getState().end("tenant-a:agent-a")

    expect(enqueueOutboxOperation).toHaveBeenLastCalledWith(expect.objectContaining({
      entity: "workdays",
      op: "create",
      data: expect.objectContaining({ action: "FINISH" }),
    }))
  })

  it("does not activate the workday when persistence fails", async () => {
    ;(AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error("disk unavailable"))

    await expect(useWorkdayStore.getState().start("tenant-a:agent-a"))
      .rejects.toThrow("disk unavailable")
    expect(useWorkdayStore.getState().activeWorkday).toBeNull()
  })

  it("keeps the active workday when persisted end fails", async () => {
    await useWorkdayStore.getState().start("tenant-a:agent-a")
    ;(AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error("disk unavailable"))

    await expect(useWorkdayStore.getState().end("tenant-a:agent-a"))
      .rejects.toThrow("disk unavailable")
    expect(useWorkdayStore.getState().activeWorkday?.key).toBe("tenant-a:agent-a")
    expect(await AsyncStorage.getItem(STORAGE_KEY)).not.toBeNull()
  })

  it("serializes an end followed by a new user's start", async () => {
    await useWorkdayStore.getState().start("tenant-a:agent-a")
    let releaseFinishWrite!: () => void
    let markFinishWriteReached!: () => void
    const finishWriteGate = new Promise<void>((resolve) => { releaseFinishWrite = resolve })
    const finishWriteReached = new Promise<void>((resolve) => { markFinishWriteReached = resolve })
    ;(AsyncStorage.setItem as jest.Mock).mockImplementationOnce(async () => {
      markFinishWriteReached()
      await finishWriteGate
    })

    const ending = useWorkdayStore.getState().end("tenant-a:agent-a")
    const starting = useWorkdayStore.getState().start("tenant-a:agent-b")
    await finishWriteReached
    // The second start must stay behind the unfinished FINISH write. Seeing
    // only the original START and pending FINISH writes proves serialization.
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(2)

    releaseFinishWrite()
    await Promise.all([ending, starting])

    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(3)
    expect(useWorkdayStore.getState().activeWorkday?.key).toBe("tenant-a:agent-b")
    const persisted = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) || "null")
    expect(persisted?.key).toBe("tenant-a:agent-b")
  })
})
