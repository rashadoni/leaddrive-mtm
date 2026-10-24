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

  it("does not turn a cancelled task back into work to start", () => {
    expect(taskWorkflowStatus({ status: "CANCELLED" })).toBe("CANCELLED")
    expect(taskWorkflowStatus({ status: "CANCELLED", persistedStatus: "CANCELLED" })).toBe("CANCELLED")
  })
})
