jest.mock("../../src/services/attendance-location", () => ({ captureAttendanceMark: jest.fn().mockResolvedValue(undefined) }))
import AsyncStorage from "@react-native-async-storage/async-storage"
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
)
jest.mock("../../src/services/outbox", () => ({
  allOutboxOperations: jest.fn().mockResolvedValue([]),
  enqueueOutboxOperation: jest.fn().mockResolvedValue(undefined),
}))
jest.mock("../../src/services/api", () => ({ api: { returnToWorkday: jest.fn() } }))
import { api } from "../../src/services/api"
import { allOutboxOperations, enqueueOutboxOperation } from "../../src/services/outbox"
import { canReturnToWorkday, returnToClosedWorkday } from "../../src/services/workday-return"
import { localDateKey, useWorkdayStore } from "../../src/store/workday"

/**
 * Owner, 2026-10-13: he closed a workday at 10:56, the card said «İş günü
 * bitib — yeni iş gününə sabah başlamaq olar», and there was no way back:
 * «как теперь обратно включить день?». The employee now returns to the day
 * closed earlier the same day. What is checked here is what the device does
 * with the server's answers; the server's own rules are proven on a real
 * Postgres in leaddrive-v2 (`mtm-workday-return-postgres.test.ts`).
 */

const KEY = "tenant-1:agent-1"
const returnToWorkday = api.returnToWorkday as jest.Mock
const queued = enqueueOutboxOperation as jest.Mock

function finishedToday(workdayId = "wd-today") {
  const finishedAt = new Date()
  return { key: KEY, workdayId, finishedAt: finishedAt.toISOString(), dateKey: localDateKey(finishedAt) }
}

function refusal(code: string, status = 409) {
  return Object.assign(new Error("The workday cannot be returned to"), { code, status })
}

async function closedDayOnThisDevice(workdayId = "wd-today") {
  const finished = finishedToday(workdayId)
  await AsyncStorage.setItem("@mtm_finished_workday_v1", JSON.stringify(finished))
  useWorkdayStore.setState({ activeWorkday: null, finishedWorkday: finished, syncError: null, hydrated: true })
  return finished
}

beforeEach(async () => {
  jest.clearAllMocks()
  await AsyncStorage.clear()
  ;(allOutboxOperations as jest.Mock).mockResolvedValue([])
  useWorkdayStore.setState({ activeWorkday: null, finishedWorkday: null, syncError: null, hydrated: true })
})

describe("the button is offered only where the server can do it", () => {
  it("takes an explicit yes", () => {
    expect(canReturnToWorkday({ workdayReturn: true })).toBe(true)
  })

  it.each([undefined, null, {}, { workdayReturn: false }, { workdayReturn: "true" as unknown as boolean }])(
    "offers nothing for %p",
    (policies) => {
      expect(canReturnToWorkday(policies)).toBe(false)
    },
  )
})

describe("returning to the day closed earlier today", () => {
  it("asks the server about that very day and shows it running again", async () => {
    await closedDayOnThisDevice()
    returnToWorkday.mockResolvedValue({
      success: true,
      idempotent: false,
      data: { workday: { id: "wd-today", workDate: "2026-10-13", status: "STARTED", startedAt: "2026-10-13T06:21:00.000Z", pausedAt: null, completedAt: null, totalPausedSeconds: 5400 } },
    })

    await expect(returnToClosedWorkday(KEY, "wd-today")).resolves.toBe("returned")

    expect(returnToWorkday).toHaveBeenCalledTimes(1)
    const sent = returnToWorkday.mock.calls[0][0]
    expect(sent.workdayId).toBe("wd-today")
    expect(sent.operationId).toMatch(/^wdr-\d+-[a-z0-9]+$/)
    expect(useWorkdayStore.getState().activeWorkday).toEqual({
      key: KEY, workdayId: "wd-today", startedAt: "2026-10-13T06:21:00.000Z", syncState: "CONFIRMED",
    })
    // "Finished today" is forgotten in memory and on disk: a restart of the
    // app must not bring «İş günü bitib» back over a running day.
    expect(useWorkdayStore.getState().finishedWorkday).toBeNull()
    expect(await AsyncStorage.getItem("@mtm_finished_workday_v1")).toBeNull()
    expect(await AsyncStorage.getItem("@mtm_active_workday_v1")).toContain("wd-today")
  })

  it("never goes through the outbox: a return that arrives tomorrow is not one", async () => {
    await closedDayOnThisDevice()
    returnToWorkday.mockRejectedValue(new Error("Network request failed"))

    await expect(returnToClosedWorkday(KEY, "wd-today")).rejects.toThrow("Network request failed")

    expect(queued).not.toHaveBeenCalled()
    // Nothing is pretended: the day stays shown as finished.
    expect(useWorkdayStore.getState().activeWorkday).toBeNull()
    expect(useWorkdayStore.getState().finishedWorkday?.workdayId).toBe("wd-today")
  })

  it("uses a new id for every tap", async () => {
    await closedDayOnThisDevice()
    returnToWorkday.mockRejectedValue(new Error("REQUEST_TIMEOUT"))
    await returnToClosedWorkday(KEY, "wd-today").catch(() => {})
    await returnToClosedWorkday(KEY, "wd-today").catch(() => {})
    const [first, second] = returnToWorkday.mock.calls.map((call) => call[0].operationId)
    expect(first).not.toBe(second)
  })

  it.each([
    ["MTM_WORKDAY_RETURN_NOT_COMPLETED", "alreadyOpen"],
    ["MTM_WORKDAY_RETURN_NOT_TODAY", "notToday"],
    ["MTM_WORKDAY_RETURN_LOCKED", "locked"],
    ["MTM_WORKDAY_RETURN_HISTORY_INVALID", "locked"],
  ])("reads the server's refusal %s as %s and changes nothing itself", async (code, outcome) => {
    await closedDayOnThisDevice()
    returnToWorkday.mockRejectedValue(refusal(code))

    await expect(returnToClosedWorkday(KEY, "wd-today")).resolves.toBe(outcome)

    expect(useWorkdayStore.getState().activeWorkday).toBeNull()
    expect(useWorkdayStore.getState().finishedWorkday?.workdayId).toBe("wd-today")
  })

  it.each([
    ["MTM_WORKDAY_RETURN_FORBIDDEN", 403],
    ["MTM_WORKDAY_NOT_FOUND", 404],
    ["MTM_WORKDAY_RETURN_RATE_LIMITED", 429],
    // A name every object has must not be mistaken for a known refusal.
    ["constructor", 409],
    ["toString", 409],
  ])("does not invent a reason for %s", async (code, status) => {
    await closedDayOnThisDevice()
    returnToWorkday.mockRejectedValue(refusal(code, status))
    await expect(returnToClosedWorkday(KEY, "wd-today")).rejects.toMatchObject({ code })
  })

  it("does not show a day running on an answer that names none", async () => {
    await closedDayOnThisDevice()
    returnToWorkday.mockResolvedValue({ success: true })

    await expect(returnToClosedWorkday(KEY, "wd-today")).resolves.toBe("returned")

    // The screen refreshes from bootstrap right after; until then nothing is assumed.
    expect(useWorkdayStore.getState().activeWorkday).toBeNull()
  })
})

describe("the day returned to is the same day going on", () => {
  it('does not reconcile a late office response after its guard revokes access', async () => {
    await closedDayOnThisDevice()
    let allowed = true
    returnToWorkday.mockImplementation(async () => { allowed = false; return { success: true, data: { workday: { id: 'wd-today', status: 'STARTED', startedAt: new Date().toISOString() } } } })
    await expect(returnToClosedWorkday(KEY, 'wd-today', () => { if (!allowed) throw new Error('scope lost') })).rejects.toThrow('scope lost')
    expect(useWorkdayStore.getState().activeWorkday).toBeNull()
    expect(useWorkdayStore.getState().finishedWorkday?.workdayId).toBe('wd-today')
  })
  it("is finished again as the same workday, and can be returned to again", async () => {
    await closedDayOnThisDevice()
    returnToWorkday.mockResolvedValue({
      success: true,
      data: { workday: { id: "wd-today", status: "STARTED", startedAt: "2026-10-13T06:21:00.000Z" } },
    })
    await returnToClosedWorkday(KEY, "wd-today")

    await useWorkdayStore.getState().end(KEY)
    expect(queued).toHaveBeenCalledTimes(1)
    expect(queued.mock.calls[0][0]).toMatchObject({ entity: "workdays", data: { action: "FINISH", workdayId: "wd-today" } })

    // The server confirmed the second finish.
    await useWorkdayStore.getState().reconcileFromServer(KEY, {
      id: "wd-today", status: "COMPLETED", workDate: localDateKey(), startedAt: "2026-10-13T06:21:00.000Z", completedAt: new Date().toISOString(),
    })
    expect(useWorkdayStore.getState().activeWorkday).toBeNull()
    expect(useWorkdayStore.getState().finishedWorkday?.workdayId).toBe("wd-today")
  })

  it("does not let «start» make a second workday out of it", async () => {
    await closedDayOnThisDevice()
    await useWorkdayStore.getState().start(KEY)
    expect(queued).not.toHaveBeenCalled()
    expect(useWorkdayStore.getState().activeWorkday).toBeNull()
  })
})

describe("a day reopened elsewhere", () => {
  it("stops being shown as finished once bootstrap reports it open", async () => {
    await closedDayOnThisDevice("wd-today")

    await useWorkdayStore.getState().reconcileFromServer(KEY, {
      id: "wd-today", status: "STARTED", startedAt: "2026-10-13T06:21:00.000Z",
    })

    expect(useWorkdayStore.getState().activeWorkday?.workdayId).toBe("wd-today")
    expect(useWorkdayStore.getState().finishedWorkday).toBeNull()
    expect(await AsyncStorage.getItem("@mtm_finished_workday_v1")).toBeNull()
  })

  it("keeps the break when the day came back paused", async () => {
    await closedDayOnThisDevice("wd-today")

    await useWorkdayStore.getState().reconcileFromServer(KEY, {
      id: "wd-today", status: "PAUSED", startedAt: "2026-10-13T06:21:00.000Z", pausedAt: "2026-10-13T06:56:00.000Z",
    })

    expect(useWorkdayStore.getState().activeWorkday).toMatchObject({ workdayId: "wd-today", paused: true, pausedAt: "2026-10-13T06:56:00.000Z" })
    expect(useWorkdayStore.getState().finishedWorkday).toBeNull()
  })

  it("leaves the memory of another finished day alone", async () => {
    const finished = await closedDayOnThisDevice("wd-other")

    await useWorkdayStore.getState().reconcileFromServer(KEY, {
      id: "wd-today", status: "STARTED", startedAt: "2026-10-13T06:21:00.000Z",
    })

    expect(useWorkdayStore.getState().finishedWorkday).toEqual(finished)
    expect(await AsyncStorage.getItem("@mtm_finished_workday_v1")).toContain("wd-other")
  })
})
