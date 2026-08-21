import {
  pendingTaskStatusOverlay,
  taskDetailPrimaryAction,
} from "../../src/screens/tasks/task-detail-state"

describe("taskDetailPrimaryAction", () => {
  it("moves an assignee through the normal task sequence", () => {
    expect(taskDetailPrimaryAction("PENDING", true, false)).toBe("start")
    expect(taskDetailPrimaryAction("IN_PROGRESS", true, false)).toBe("complete")
  })

  it("offers return only for a completed task a manager can review", () => {
    expect(taskDetailPrimaryAction("COMPLETED", false, true)).toBe("return")
    expect(taskDetailPrimaryAction("IN_PROGRESS", false, true)).toBeNull()
  })

  it("does not invent actions for cancelled, overdue, or foreign tasks", () => {
    expect(taskDetailPrimaryAction("CANCELLED", true, false)).toBeNull()
    expect(taskDetailPrimaryAction("OVERDUE", true, false)).toBeNull()
    expect(taskDetailPrimaryAction("PENDING", false, false)).toBeNull()
  })
})

describe("pendingTaskStatusOverlay", () => {
  it("restores a queued completion as fully completed after a cold start", () => {
    expect(pendingTaskStatusOverlay("COMPLETED", "Фото приложено")).toEqual({
      status: "COMPLETED",
      persistedStatus: "COMPLETED",
      result: "Фото приложено",
      returnReason: null,
      progress: 100,
    })
  })

  it("does not invent completion fields for a queued start", () => {
    expect(pendingTaskStatusOverlay("IN_PROGRESS")).toEqual({
      status: "IN_PROGRESS",
      persistedStatus: "IN_PROGRESS",
    })
  })
})
