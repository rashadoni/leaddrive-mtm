import { Model } from '@nozbe/watermelondb'
import { field, json, readonly, date } from '@nozbe/watermelondb/decorators'

export type OutboxOpType = 'create' | 'update'
export type OutboxEntity  = 'visits' | 'orders' | 'tasks'
export type OutboxStatus  = 'pending' | 'syncing' | 'synced' | 'failed'

const sanitizeData = (raw: unknown): Record<string, unknown> => {
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  return {}
}

/**
 * OutboxOperation — local-only record of an offline mutation pending server push.
 *
 * Lifecycle:
 *   pending → (SyncManager picks up) → syncing → synced (after server ack)
 *   syncing → failed (after max retries)
 *
 * M2-1c (SyncManager) creates and updates these records.
 * Records with status='synced' are purged after 7 days.
 */
export class OutboxOperation extends Model {
  static table = 'outbox_operations'

  /** UUIDv4 idempotency key sent to /sync/push */
  @field('operation_id') operationId!: string
  @field('op_type') opType!: OutboxOpType
  @field('entity') entity!: OutboxEntity
  /** Full entity payload (id + changed fields) */
  @json('data', sanitizeData) data!: Record<string, unknown>
  @field('client_timestamp') clientTimestamp!: number
  @field('status') status!: OutboxStatus
  @field('retry_count') retryCount!: number
  @field('last_error') lastError!: string
  @field('synced_at') syncedAt!: number | null

  @readonly @date('created_at') createdAt!: Date
}
