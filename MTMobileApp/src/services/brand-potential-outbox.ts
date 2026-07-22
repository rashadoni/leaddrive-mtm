import type { BrandPotentialFields } from "../components/BrandPotentialModal"
import { allOutboxOperations, enqueueOutboxOperation, type OutboxOperation } from "./outbox"

/**
 * Durable GAP-005 writes. Brand potential capture happens in the field and
 * must survive connectivity loss and a cold restart, so agents never write
 * directly to the network. The shared sync engine sends these idempotently to
 * mobile/sync/push and exposes pending/conflict counts in SyncStatusChip.
 */
export function queueBrandPotentialCreate(
  contactId: string,
  fields: BrandPotentialFields,
): Promise<OutboxOperation> {
  return enqueueOutboxOperation({
    entity: "brandPotentials",
    op: "create",
    data: { contactId, ...fields },
  })
}

export function queueBrandPotentialEnd(
  id: string,
  periodEnd: string,
  reason: string,
): Promise<OutboxOperation> {
  return enqueueOutboxOperation({
    entity: "brandPotentials",
    op: "update",
    data: { id, periodEnd, reason },
  })
}

export async function countPendingBrandPotentialUpdates(): Promise<number> {
  const operations = await allOutboxOperations()
  return operations.filter((operation) => operation.entity === "brandPotentials").length
}
