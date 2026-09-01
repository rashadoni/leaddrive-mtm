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
import { allOutboxOperations } from "../../src/services/outbox"

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
    useWorkdayStore.setState({ activeWorkday: null, syncError: null, hydrated: true })
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

  it("clears an acknowledged FINISH when an older bootstrap names another completed workday", async () => {
    useWorkdayStore.setState({ activeWorkday: {
      key: "t:a", workdayId: "srv-finished", startedAt: "2026-09-01T00:05:00.000Z", syncState: "FINISH_PENDING",
    } })

    await useWorkdayStore.getState().reconcileFromServer("t:a", {
      id: "srv-yesterday",
      status: "COMPLETED",
      startedAt: "2026-08-31T06:00:00.000Z",
      completedAt: "2026-08-31T17:00:00.000Z",
    })

    expect(useWorkdayStore.getState().activeWorkday).toBeNull()
    expect(await AsyncStorage.getItem("@mtm_active_workday_v1")).toBeNull()
  })

  it("retains FINISH_PENDING for a durable finish conflict even with another completed workday", async () => {
    const local = {
      key: "t:a", workdayId: "srv-finish-conflict", startedAt: "2026-09-01T00:05:00.000Z", syncState: "FINISH_PENDING" as const,
    }
    useWorkdayStore.setState({ activeWorkday: local })
    mockedAllOutboxOperations.mockResolvedValue([queuedWorkday("FINISH", "srv-finish-conflict", "conflict")])

    await useWorkdayStore.getState().reconcileFromServer("t:a", {
      id: "srv-yesterday",
      status: "COMPLETED",
      startedAt: "2026-08-31T06:00:00.000Z",
      completedAt: "2026-08-31T17:00:00.000Z",
    })

    expect(useWorkdayStore.getState().activeWorkday).toEqual(local)
  })
})
