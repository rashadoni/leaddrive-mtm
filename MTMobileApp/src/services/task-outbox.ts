import { allOutboxOperations, enqueueOutboxOperation, type OutboxOperation } from "./outbox"

/**
 * Write-side helpers for durable task mutations (P0-B item 2).
 *
 * Task start/complete used to hit the network directly (api.updateTask), so a
 * status change made offline was lost. These route the change through the
 * durable outbox instead: it maps to the server's idempotent
 * `POST /mobile/sync/push` contract (entity "tasks", op "update"), survives a
 * cold restart, and flushes on reconnect via the app lifecycle. The screen
 * updates optimistically and reconciles with server truth on the next flush.
 *
 * `expectedVersion` is intentionally omitted: the mobile task shape does not
 * carry a version column, and the server only enforces optimistic-concurrency
 * when the field is present. The status-transition guard still applies
 * server-side, and a rejected transition is reconciled by a re-fetch.
 */
export function queueTaskStatusUpdate(
  id: string,
  status: string,
  result?: string,
): Promise<OutboxOperation> {
  const data: Record<string, unknown> = { id, status }
  if (result !== undefined && result !== "") data.result = result
  return enqueueOutboxOperation({ entity: "tasks", op: "update", data })
}

/** Count of queued task operations awaiting sync (for the pending indicator). */
export async function countPendingTaskUpdates(): Promise<number> {
  const ops = await allOutboxOperations()
  return ops.filter((op) => op.entity === "tasks" && op.status === "pending").length
}
