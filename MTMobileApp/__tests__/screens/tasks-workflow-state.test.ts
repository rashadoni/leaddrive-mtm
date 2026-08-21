import { taskWorkflowStatus } from "../../src/screens/tasks/tasks-workflow-state"

describe("taskWorkflowStatus", () => {
  it("keeps a derived overdue task in its persisted pending workflow", () => {
    expect(taskWorkflowStatus({ status: "OVERDUE", persistedStatus: "PENDING" })).toBe("PENDING")
  })

  it("uses the persisted mutable status when the display status differs", () => {
    expect(taskWorkflowStatus({ status: "OVERDUE", persistedStatus: "IN_PROGRESS" })).toBe("IN_PROGRESS")
  })

  it("keeps terminal tasks completed", () => {
    expect(taskWorkflowStatus({ status: "COMPLETED", persistedStatus: "COMPLETED" })).toBe("COMPLETED")
  })
})
