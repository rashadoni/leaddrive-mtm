import AsyncStorage from "@react-native-async-storage/async-storage"
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)
jest.mock("../../src/services/outbox", () => ({
  allOutboxOperations: jest.fn().mockResolvedValue([]),
  enqueueOutboxOperation: jest.fn().mockResolvedValue(undefined),
}))
import { useWorkdayStore } from "../../src/store/workday"
import { isWorkdayOpen } from "../../src/services/bootstrap"
import { allOutboxOperations, enqueueOutboxOperation } from "../../src/services/outbox"

const mockedAllOutboxOperations = allOutboxOperations as jest.Mock

function queuedWorkday(action: "START" | "FINISH", workdayId: string, status: "pending" | "conflict" = "pending") {
  return {
    operationId: `op-${action}`,
    entity: "workdays",
    op: "create",
    data: action === "START" ? { action, id: workdayId } : { action, workdayId },
    clientTimestamp: 1,
    attempts: 0,
    nextAttemptAt: 0,
    scopeKey: "t:a",
    status,
  }
}

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
    mockedAllOutboxOperations.mockResolvedValue([])
    useWorkdayStore.setState({ activeWorkday: null, finishedWorkday: null, syncError: null, hydrated: true })
  })

  it("adopts an open server shift when local is empty (restore on new device)", async () => {
    await useWorkdayStore.getState().reconcileFromServer("t:a", {
      id: "srv-1", status: "ACTIVE", startedAt: "2026-07-19T08:00:00.000Z",
    })
    expect(useWorkdayStore.getState().activeWorkday).toEqual({
      key: "t:a", workdayId: "srv-1", startedAt: "2026-07-19T08:00:00.000Z",
      syncState: "CONFIRMED",
    })
    expect(await AsyncStorage.getItem("@mtm_active_workday_v1")).toContain("srv-1")
  })

  it("keeps a Workforce-paused shift visible but never marks it executable", async () => {
    await useWorkdayStore.getState().reconcileFromServer("t:a", {
      id: "srv-paused", status: "PAUSED", startedAt: "2026-07-19T08:00:00.000Z",
    })
    expect(useWorkdayStore.getState().activeWorkday).toEqual({
      key: "t:a", workdayId: "srv-paused", startedAt: "2026-07-19T08:00:00.000Z",
      syncState: "CONFIRMED", paused: true,
    })
  })

  it("clears local when the server shows the SAME shift completed", async () => {
    useWorkdayStore.setState({ activeWorkday: {
      key: "t:a", workdayId: "srv-1", startedAt: "2026-07-19T08:00:00.000Z", syncState: "CONFIRMED",
    } })
    await useWorkdayStore.getState().reconcileFromServer("t:a", {
      id: "srv-1", status: "COMPLETED", startedAt: "2026-07-19T08:00:00.000Z", completedAt: "2026-07-19T17:00:00.000Z",
    })
    expect(useWorkdayStore.getState().activeWorkday).toBeNull()
  })

  it("never drops an un-synced optimistic start (server has no shift yet)", async () => {
    const local = {
      key: "t:a", workdayId: "wd-local", startedAt: "2026-07-19T09:00:00.000Z", syncState: "START_PENDING" as const,
    }
    mockedAllOutboxOperations.mockResolvedValue([queuedWorkday("START", "wd-local")])
    useWorkdayStore.setState({ activeWorkday: local })
    await useWorkdayStore.getState().reconcileFromServer("t:a", null)
    expect(useWorkdayStore.getState().activeWorkday).toEqual(local)
  })

  it("does not clear a local shift whose id differs from the server's completed one", async () => {
    const local = {
      key: "t:a", workdayId: "wd-local", startedAt: "2026-07-19T09:00:00.000Z", syncState: "CONFIRMED" as const,
    }
    useWorkdayStore.setState({ activeWorkday: local })
    await useWorkdayStore.getState().reconcileFromServer("t:a", {
      id: "srv-other", status: "COMPLETED", startedAt: "x", completedAt: "y",
    })
    expect(useWorkdayStore.getState().activeWorkday).toEqual(local)
  })

  it("keeps GPS stopped while FINISH is still queued against an open server shift", async () => {
    const local = {
      key: "t:a", workdayId: "srv-1", startedAt: "2026-07-19T09:00:00.000Z", syncState: "FINISH_PENDING" as const,
    }
    useWorkdayStore.setState({ activeWorkday: local })
    mockedAllOutboxOperations.mockResolvedValue([queuedWorkday("FINISH", "srv-1")])

    await useWorkdayStore.getState().reconcileFromServer("t:a", {
      id: "srv-1", status: "ACTIVE", startedAt: "2026-07-19T09:00:00.000Z",
    })

    expect(useWorkdayStore.getState().activeWorkday).toEqual(local)
  })

  it("clears FINISH_PENDING after the server confirms completion", async () => {
    useWorkdayStore.setState({ activeWorkday: {
      key: "t:a", workdayId: "srv-1", startedAt: "2026-07-19T09:00:00.000Z", syncState: "FINISH_PENDING",
    } })

    await useWorkdayStore.getState().reconcileFromServer("t:a", {
      id: "srv-1",
      status: "COMPLETED",
      startedAt: "2026-07-19T09:00:00.000Z",
      completedAt: "2026-07-19T17:00:00.000Z",
    })

    expect(useWorkdayStore.getState().activeWorkday).toBeNull()
  })
})

describe("finished workday memory (field UX audit M-05 / B3)", () => {
  beforeEach(async () => {
    await AsyncStorage.clear()
    mockedAllOutboxOperations.mockResolvedValue([])
    ;(enqueueOutboxOperation as jest.Mock).mockClear()
    useWorkdayStore.setState({ activeWorkday: null, finishedWorkday: null, syncError: null, hydrated: true })
  })

  it("remembers when the server confirms this device's FINISH", async () => {
    useWorkdayStore.setState({ activeWorkday: {
      key: "t:a", workdayId: "srv-1", startedAt: "2026-09-05T09:00:00.000Z", syncState: "FINISH_PENDING",
    } })

    await useWorkdayStore.getState().reconcileFromServer("t:a", {
      id: "srv-1",
      status: "COMPLETED",
      workDate: "2026-09-05",
      startedAt: "2026-09-05T09:00:00.000Z",
      completedAt: "2026-09-05T14:24:00.000Z",
    })

    expect(useWorkdayStore.getState().activeWorkday).toBeNull()
    expect(useWorkdayStore.getState().finishedWorkday).toEqual({
      key: "t:a", workdayId: "srv-1", finishedAt: "2026-09-05T14:24:00.000Z", dateKey: "2026-09-05",
    })
    expect(await AsyncStorage.getItem("@mtm_finished_workday_v1")).toContain("srv-1")
  })

  it("adopts a finished server shift on a fresh device so the day is not offered again", async () => {
    await useWorkdayStore.getState().reconcileFromServer("t:a", {
      id: "srv-2", status: "COMPLETED", workDate: "2026-09-05", startedAt: "2026-09-05T08:00:00.000Z", completedAt: "2026-09-05T17:00:00.000Z",
    })

    expect(useWorkdayStore.getState().activeWorkday).toBeNull()
    expect(useWorkdayStore.getState().finishedWorkday?.workdayId).toBe("srv-2")
  })

  it("refuses to start a new shift on the day the previous one was finished (owner decision 4)", async () => {
    const today = new Date()
    const dateKey = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-")
    useWorkdayStore.setState({ finishedWorkday: { key: "t:a", workdayId: "srv-3", finishedAt: today.toISOString(), dateKey } })

    await useWorkdayStore.getState().start("t:a")

    expect(useWorkdayStore.getState().activeWorkday).toBeNull()
    expect(enqueueOutboxOperation).not.toHaveBeenCalled()
  })

  it("still starts a shift on a later day", async () => {
    useWorkdayStore.setState({ finishedWorkday: { key: "t:a", workdayId: "srv-4", finishedAt: "2026-09-04T17:00:00.000Z", dateKey: "2026-09-04" } })

    await useWorkdayStore.getState().start("t:a")

    expect(useWorkdayStore.getState().activeWorkday?.syncState).toBe("START_PENDING")
  })

  it("hydrates the remembered finish", async () => {
    await AsyncStorage.setItem("@mtm_finished_workday_v1", JSON.stringify({ key: "t:a", workdayId: "srv-5", finishedAt: "2026-09-05T18:24:00.000Z", dateKey: "2026-09-05" }))
    useWorkdayStore.setState({ hydrated: false })

    await useWorkdayStore.getState().hydrate()

    expect(useWorkdayStore.getState().finishedWorkday?.finishedAt).toBe("2026-09-05T18:24:00.000Z")
  })
})
