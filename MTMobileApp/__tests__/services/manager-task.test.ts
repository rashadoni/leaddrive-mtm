import { giveTaskFailure, laterDays, taskText, toGivenTask } from "../../src/services/manager-task"

/** «Дать задачу» on the manager's phone (owner, 2026-10-20). */
describe("giving a task from the phone", () => {
  it("names each refusal the way the sheet says it", () => {
    const coded = (code: string) => Object.assign(new Error("HTTP 403"), { code })
    expect(giveTaskFailure(coded("MTM_TASK_SCOPE_DENIED"))).toBe("notYourTeam")
    expect(giveTaskFailure(coded("MTM_MOBILE_PERMISSION_REQUIRED"))).toBe("notYourTeam")
    expect(giveTaskFailure(coded("MTM_TASK_DUE_IN_PAST"))).toBe("dayPassed")
    expect(giveTaskFailure(coded("MTM_TASK_INVALID"))).toBe("invalid")
    expect(giveTaskFailure(new Error("Network request failed"))).toBe("offline")
    expect(giveTaskFailure(new Error("REQUEST_TIMEOUT"))).toBe("offline")
    expect(giveTaskFailure(new Error("SESSION_EXPIRED"))).toBe("session")
    expect(giveTaskFailure(new Error("boom"))).toBe("failed")
  })

  it("reads the task and whether the pop-up reached the phone, and nothing it was not told", () => {
    expect(toGivenTask({ success: true, data: { task: { id: "task-1" }, pushReady: true } })).toEqual({ taskId: "task-1", pushReady: true })
    expect(toGivenTask({ success: true, data: { task: { id: "task-2" } } })).toEqual({ taskId: "task-2", pushReady: null })
    expect(toGivenTask(null)).toEqual({ taskId: null, pushReady: null })
  })

  it("offers the two weeks after tomorrow under «Дата…», across a month's end", () => {
    const days = laterDays("2026-10-30")
    expect(days).toHaveLength(14)
    expect(days[0]).toBe("2026-11-01")
    expect(days[13]).toBe("2026-11-14")
  })

  it("sends the task as one line, as the server keeps it", () => {
    expect(taskText("  Bring\n the   samples ")).toBe("Bring the samples")
    expect(taskText("x".repeat(250))).toHaveLength(200)
    expect(taskText("   ")).toBe("")
  })
})
