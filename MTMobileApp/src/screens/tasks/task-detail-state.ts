export type TaskDetailPrimaryAction = "start" | "complete" | "return" | null

export function pendingTaskStatusOverlay(status: string, result?: unknown) {
  return {
    status,
    persistedStatus: status,
    ...(typeof result === "string" && result ? { result } : {}),
    ...(status === "COMPLETED" ? { returnReason: null, progress: 100 } : {}),
  }
}

/**
 * Keep the detail screen's dominant action deterministic. An assignee moves
 * their own task forward; a manager can return a completed task for rework.
 * Every other state is deliberately read-only instead of offering an action
 * the current mobile API cannot safely perform.
 */
export function taskDetailPrimaryAction(
  status: string,
  isOwnTask: boolean,
  canReturn: boolean,
): TaskDetailPrimaryAction {
  if (isOwnTask && status === "PENDING") return "start"
  if (isOwnTask && status === "IN_PROGRESS") return "complete"
  if (canReturn && status === "COMPLETED") return "return"
  return null
}
