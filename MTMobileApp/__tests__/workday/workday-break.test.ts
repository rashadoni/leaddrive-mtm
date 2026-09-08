import AsyncStorage from "@react-native-async-storage/async-storage"
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)
jest.mock("../../src/services/outbox", () => ({
  allOutboxOperations: jest.fn().mockResolvedValue([]),
  enqueueOutboxOperation: jest.fn().mockResolvedValue(undefined),
}))
import { useWorkdayStore } from "../../src/store/workday"
import { enqueueOutboxOperation } from "../../src/services/outbox"

const mockedEnqueue = enqueueOutboxOperation as jest.Mock
const KEY = "org-1:agent-1"
const STORAGE_KEY = "@mtm_active_workday_v1"

function setActive(overrides: Record<string, unknown> = {}) {
  useWorkdayStore.setState({
    activeWorkday: {
      key: KEY,
      workdayId: "wd-1",
      startedAt: "2026-09-08T05:00:00.000Z",
      syncState: "CONFIRMED",
      ...overrides,
    } as never,
    hydrated: true,
    syncError: null,
  })
}

describe("workday break (field UX audit A7, tasks T2/T3)", () => {
  beforeEach(async () => {
    await AsyncStorage.clear()
    mockedEnqueue.mockClear()
    useWorkdayStore.setState({ activeWorkday: null, finishedWorkday: null, syncError: null, hydrated: true })
  })

  it("queues PAUSE and remembers when the break began", async () => {
    setActive()

    await useWorkdayStore.getState().pause(KEY)

    expect(mockedEnqueue).toHaveBeenCalledWith(expect.objectContaining({
      entity: "workdays",
      data: expect.objectContaining({ action: "PAUSE", workdayId: "wd-1" }),
    }))
    const active = useWorkdayStore.getState().activeWorkday
    expect(active?.paused).toBe(true)
    // Without this the card can only say "Перерыв" — true and useless to
    // someone deciding whether it is time to go back (T3).
    expect(typeof active?.pausedAt).toBe("string")
  })

  it("survives a restart: the break and its time are persisted", async () => {
    setActive()
    await useWorkdayStore.getState().pause(KEY)

    useWorkdayStore.setState({ activeWorkday: null, hydrated: false })
    await useWorkdayStore.getState().hydrate()

    const restored = useWorkdayStore.getState().activeWorkday
    expect(restored?.paused).toBe(true)
    expect(restored?.pausedAt).toBe(JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!).pausedAt)
  })

  it("queues RESUME and drops the break time", async () => {
    setActive({ paused: true, pausedAt: "2026-09-08T09:05:00.000Z" })

    await useWorkdayStore.getState().resume(KEY)

    expect(mockedEnqueue).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "RESUME", workdayId: "wd-1" }),
    }))
    const active = useWorkdayStore.getState().activeWorkday
    expect(active?.paused).toBeUndefined()
    expect(active?.pausedAt).toBeUndefined()
  })

  it("refuses to pause a shift the server has not confirmed", async () => {
    // PAUSE would queue behind a START that may still be rejected, and the
    // server answers MTM_WORKDAY_NOT_RUNNING anyway.
    setActive({ syncState: "START_PENDING" })

    await useWorkdayStore.getState().pause(KEY)

    expect(mockedEnqueue).not.toHaveBeenCalled()
    expect(useWorkdayStore.getState().activeWorkday?.paused).toBeUndefined()
  })

  it("refuses to pause twice and to resume what is not paused", async () => {
    setActive({ paused: true, pausedAt: "2026-09-08T09:05:00.000Z" })
    await useWorkdayStore.getState().pause(KEY)
    expect(mockedEnqueue).not.toHaveBeenCalled()
    // The first moment is the one that counts; a second PAUSE would move it.
    expect(useWorkdayStore.getState().activeWorkday?.pausedAt).toBe("2026-09-08T09:05:00.000Z")

    setActive()
    await useWorkdayStore.getState().resume(KEY)
    expect(mockedEnqueue).not.toHaveBeenCalled()
  })

  it("ignores a break for another agent's shift", async () => {
    setActive()
    await useWorkdayStore.getState().pause("org-2:agent-2")
    expect(mockedEnqueue).not.toHaveBeenCalled()
  })

  it("takes the break time from the server on reconcile", async () => {
    // The pause may have been started on another device or by Workforce; the
    // app must show its real start, not the moment it happened to sync (T3).
    await useWorkdayStore.getState().reconcileFromServer(KEY, {
      id: "wd-1",
      status: "PAUSED",
      startedAt: "2026-09-08T05:00:00.000Z",
      pausedAt: "2026-09-08T09:05:00.000Z",
    } as never)

    const active = useWorkdayStore.getState().activeWorkday
    expect(active?.paused).toBe(true)
    expect(active?.pausedAt).toBe("2026-09-08T09:05:00.000Z")
  })

  it("keeps a paused shift usable when the server sends no pause time", async () => {
    await useWorkdayStore.getState().reconcileFromServer(KEY, {
      id: "wd-1",
      status: "PAUSED",
      startedAt: "2026-09-08T05:00:00.000Z",
    } as never)

    const active = useWorkdayStore.getState().activeWorkday
    expect(active?.paused).toBe(true)
    expect(active?.pausedAt).toBeUndefined()
  })
})
