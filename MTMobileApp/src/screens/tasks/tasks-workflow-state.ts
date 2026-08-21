export type TaskWorkflowStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED"

/**
 * The API may expose OVERDUE as a derived display status while retaining the
 * real mutable lifecycle state in persistedStatus. Keep those tasks in the
 * "To do" flow so an agent can still start and finish late work.
 */
export function taskWorkflowStatus(task: {
  status?: string | null
  persistedStatus?: string | null
}): TaskWorkflowStatus {
  const status = String(task.persistedStatus || task.status || "PENDING").toUpperCase()
  if (status === "IN_PROGRESS" || status === "COMPLETED") return status
  return "PENDING"
}
