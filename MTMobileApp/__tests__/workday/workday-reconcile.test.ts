import AsyncStorage from "@react-native-async-storage/async-storage"
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)
import { useWorkdayStore } from "../../src/store/workday"
import { isWorkdayOpen } from "../../src/services/bootstrap"

describe("isWorkdayOpen", () => {
  it("is open when started and not completed", () => {
    expect(isWorkdayOpen({ id: "w1", status: "ACTIVE", startedAt: "2026-07-19T08:00:00.000Z" })).toBe(true)
  })
  it("is closed when completed, missing startedAt, or null", () => {
    expect(isWorkdayOpen({ id: "w1", status: "COMPLETED", startedAt: "x", completedAt: "y" })).toBe(false)
    expect(isWorkdayOpen({ id: "w1", status: "ACTIVE" })).toBe(false)
    expect(isWorkdayOpen(null)).toBe(false)
  })
})

describe("workday reconcileFromServer", () => {
  beforeEach(async () => {
    await AsyncStorage.clear()
    useWorkdayStore.setState({ activeWorkday: null, hydrated: true })
  })

  it("adopts an open server shift when local is empty (restore on new device)", async () => {
    await useWorkdayStore.getState().reconcileFromServer("t:a", {
      id: "srv-1", status: "ACTIVE", startedAt: "2026-07-19T08:00:00.000Z",
    })
    expect(useWorkdayStore.getState().activeWorkday).toEqual({
      key: "t:a", workdayId: "srv-1", startedAt: "2026-07-19T08:00:00.000Z",
    })
    expect(await AsyncStorage.getItem("@mtm_active_workday_v1")).toContain("srv-1")
  })

  it("clears local when the server shows the SAME shift completed", async () => {
    useWorkdayStore.setState({ activeWorkday: { key: "t:a", workdayId: "srv-1", startedAt: "2026-07-19T08:00:00.000Z" } })
    await useWorkdayStore.getState().reconcileFromServer("t:a", {
      id: "srv-1", status: "COMPLETED", startedAt: "2026-07-19T08:00:00.000Z", completedAt: "2026-07-19T17:00:00.000Z",
    })
    expect(useWorkdayStore.getState().activeWorkday).toBeNull()
  })

  it("never drops an un-synced optimistic start (server has no shift yet)", async () => {
    const local = { key: "t:a", workdayId: "wd-local", startedAt: "2026-07-19T09:00:00.000Z" }
    useWorkdayStore.setState({ activeWorkday: local })
    await useWorkdayStore.getState().reconcileFromServer("t:a", null)
    expect(useWorkdayStore.getState().activeWorkday).toEqual(local)
  })

  it("does not clear a local shift whose id differs from the server's completed one", async () => {
    const local = { key: "t:a", workdayId: "wd-local", startedAt: "2026-07-19T09:00:00.000Z" }
    useWorkdayStore.setState({ activeWorkday: local })
    await useWorkdayStore.getState().reconcileFromServer("t:a", {
      id: "srv-other", status: "COMPLETED", startedAt: "x", completedAt: "y",
    })
    expect(useWorkdayStore.getState().activeWorkday).toEqual(local)
  })
})
