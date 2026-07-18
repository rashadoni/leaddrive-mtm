jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)

import AsyncStorage from "@react-native-async-storage/async-storage"
import { useWorkdayStore, workdayKey } from "../../src/store/workday"

const STORAGE_KEY = "@mtm_active_workday_v1"

describe("workday identity", () => {
  beforeEach(async () => {
    await AsyncStorage.clear()
    jest.clearAllMocks()
    useWorkdayStore.setState({ activeWorkday: null, hydrated: false })
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
    expect(await AsyncStorage.getItem(STORAGE_KEY)).not.toBeNull()

    await useWorkdayStore.getState().end("tenant-a:agent-a")
    expect(useWorkdayStore.getState().activeWorkday).toBeNull()
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it("does not activate the workday when persistence fails", async () => {
    ;(AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error("disk unavailable"))

    await expect(useWorkdayStore.getState().start("tenant-a:agent-a"))
      .rejects.toThrow("disk unavailable")
    expect(useWorkdayStore.getState().activeWorkday).toBeNull()
  })

  it("keeps the active workday when persisted end fails", async () => {
    await useWorkdayStore.getState().start("tenant-a:agent-a")
    ;(AsyncStorage.removeItem as jest.Mock).mockRejectedValueOnce(new Error("disk unavailable"))

    await expect(useWorkdayStore.getState().end("tenant-a:agent-a"))
      .rejects.toThrow("disk unavailable")
    expect(useWorkdayStore.getState().activeWorkday?.key).toBe("tenant-a:agent-a")
    expect(await AsyncStorage.getItem(STORAGE_KEY)).not.toBeNull()
  })

  it("serializes an end followed by a new user's start", async () => {
    await useWorkdayStore.getState().start("tenant-a:agent-a")
    let releaseRemove!: () => void
    const removeGate = new Promise<void>((resolve) => { releaseRemove = resolve })
    ;(AsyncStorage.removeItem as jest.Mock).mockImplementationOnce(async () => {
      await removeGate
      await AsyncStorage.clear()
    })

    const ending = useWorkdayStore.getState().end("tenant-a:agent-a")
    const starting = useWorkdayStore.getState().start("tenant-a:agent-b")
    await Promise.resolve()
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(2)

    releaseRemove()
    await Promise.all([ending, starting])

    expect(useWorkdayStore.getState().activeWorkday?.key).toBe("tenant-a:agent-b")
    const persisted = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) || "null")
    expect(persisted?.key).toBe("tenant-a:agent-b")
  })
})
