import { appSchema, tableSchema } from '@nozbe/watermelondb'

/**
 * WatermelonDB schema — mirrors server-side Prisma MTM models.
 *
 * Conventions:
 * - Column names: snake_case (matches Prisma @@map table columns)
 * - Timestamps: stored as epoch milliseconds (number), NOT ISO strings
 * - Nullable fields: isOptional: true
 * - JSON fields: stored as string type, deserialized by @json decorator
 * - IDs: WDB record ID == server CUID (client-generated, no mapping needed)
 *
 * Tables:
 *   customers, sku_categories, skus, routes, route_points,
 *   visits, orders, tasks, outbox_operations
 *
 * NOT synced (server-only):
 *   mtm_audit_logs, mtm_notifications, mtm_settings, mtm_photos (metadata only)
 */
export default appSchema({
  version: 1,
  tables: [
    // ─── Customers ───────────────────────────────────────────────────────
    tableSchema({
      name: 'customers',
      columns: [
        { name: 'organization_id', type: 'string' },
        { name: 'code',            type: 'string', isOptional: true },
        { name: 'name',            type: 'string' },
        { name: 'category',        type: 'string' },          // 'A' | 'B' | 'C'
        { name: 'status',          type: 'string' },          // 'ACTIVE' | 'INACTIVE'
        { name: 'address',         type: 'string', isOptional: true },
        { name: 'city',            type: 'string', isOptional: true },
        { name: 'district',        type: 'string', isOptional: true },
        { name: 'latitude',        type: 'number', isOptional: true },
        { name: 'longitude',       type: 'number', isOptional: true },
        { name: 'phone',           type: 'string', isOptional: true },
        { name: 'contact_person',  type: 'string', isOptional: true },
        { name: 'notes',           type: 'string', isOptional: true },
        { name: 'geofence_radius', type: 'number', isOptional: true },
        { name: 'created_at',      type: 'number' },
        { name: 'updated_at',      type: 'number' },
        { name: 'deleted_at',      type: 'number', isOptional: true },
      ],
    }),

    // ─── SKU Categories ───────────────────────────────────────────────────
    tableSchema({
      name: 'sku_categories',
      columns: [
        { name: 'organization_id', type: 'string' },
        { name: 'parent_id',       type: 'string', isOptional: true },
        { name: 'name',            type: 'string' },
        { name: 'name_az',         type: 'string', isOptional: true },
        { name: 'name_en',         type: 'string', isOptional: true },
        { name: 'code',            type: 'string', isOptional: true },
        { name: 'icon_url',        type: 'string', isOptional: true },
        { name: 'sort_order',      type: 'number' },
        { name: 'is_active',       type: 'boolean' },
        { name: 'created_at',      type: 'number' },
        { name: 'updated_at',      type: 'number' },
      ],
    }),

    // ─── SKUs ─────────────────────────────────────────────────────────────
    tableSchema({
      name: 'skus',
      columns: [
        { name: 'organization_id', type: 'string' },
        { name: 'category_id',     type: 'string', isOptional: true },
        { name: 'code',            type: 'string' },
        { name: 'external_id',     type: 'string', isOptional: true },
        { name: 'barcode',         type: 'string', isOptional: true },
        { name: 'name',            type: 'string' },
        { name: 'name_az',         type: 'string', isOptional: true },
        { name: 'name_en',         type: 'string', isOptional: true },
        { name: 'description',     type: 'string', isOptional: true },
        { name: 'brand',           type: 'string', isOptional: true },
        { name: 'unit',            type: 'string' },
        { name: 'pack_size',       type: 'number' },
        { name: 'base_price',      type: 'number' },
        { name: 'currency',        type: 'string' },
        { name: 'image_url',       type: 'string', isOptional: true },
        { name: 'thumbnail_url',   type: 'string', isOptional: true },
        { name: 'is_active',       type: 'boolean' },
        { name: 'weight',          type: 'number', isOptional: true },
        { name: 'volume_ml',       type: 'number', isOptional: true },
        { name: 'created_at',      type: 'number' },
        { name: 'updated_at',      type: 'number' },
      ],
    }),

    // ─── Routes ───────────────────────────────────────────────────────────
    tableSchema({
      name: 'routes',
      columns: [
        { name: 'organization_id', type: 'string' },
        { name: 'agent_id',        type: 'string' },
        { name: 'date',            type: 'number' },         // epoch ms, midnight UTC
        { name: 'name',            type: 'string', isOptional: true },
        { name: 'status',          type: 'string' },         // PLANNED | ACTIVE | COMPLETED
        { name: 'total_points',    type: 'number' },
        { name: 'visited_points',  type: 'number' },
        { name: 'started_at',      type: 'number', isOptional: true },
        { name: 'completed_at',    type: 'number', isOptional: true },
        { name: 'notes',           type: 'string', isOptional: true },
        { name: 'created_at',      type: 'number' },
        { name: 'updated_at',      type: 'number' },
        { name: 'deleted_at',      type: 'number', isOptional: true },
      ],
    }),

    // ─── Route Points ─────────────────────────────────────────────────────
    tableSchema({
      name: 'route_points',
      columns: [
        { name: 'route_id',      type: 'string' },
        { name: 'customer_id',   type: 'string' },
        { name: 'order_index',   type: 'number' },
        { name: 'status',        type: 'string' },          // PENDING | VISITED | SKIPPED
        { name: 'planned_time',  type: 'number', isOptional: true },
        { name: 'visited_at',    type: 'number', isOptional: true },
        { name: 'notes',         type: 'string', isOptional: true },
        { name: 'deleted_at',    type: 'number', isOptional: true },
      ],
    }),

    // ─── Visits ───────────────────────────────────────────────────────────
    tableSchema({
      name: 'visits',
      columns: [
        { name: 'organization_id',  type: 'string' },
        { name: 'agent_id',         type: 'string' },
        { name: 'customer_id',      type: 'string' },
        { name: 'status',           type: 'string' },        // CHECKED_IN | CHECKED_OUT
        { name: 'check_in_at',      type: 'number' },
        { name: 'check_out_at',     type: 'number', isOptional: true },
        { name: 'check_in_lat',     type: 'number', isOptional: true },
        { name: 'check_in_lng',     type: 'number', isOptional: true },
        { name: 'check_out_lat',    type: 'number', isOptional: true },
        { name: 'check_out_lng',    type: 'number', isOptional: true },
        { name: 'duration',         type: 'number', isOptional: true },
        { name: 'notes',            type: 'string', isOptional: true },
        { name: 'tasks_completed',  type: 'number' },
        { name: 'tasks_total',      type: 'number' },
        { name: 'created_at',       type: 'number' },
        { name: 'updated_at',       type: 'number' },
        { name: 'deleted_at',       type: 'number', isOptional: true },
      ],
    }),

    // ─── Orders ───────────────────────────────────────────────────────────
    tableSchema({
      name: 'orders',
      columns: [
        { name: 'organization_id', type: 'string' },
        { name: 'agent_id',        type: 'string' },
        { name: 'customer_id',     type: 'string' },
        { name: 'visit_id',        type: 'string', isOptional: true },
        { name: 'order_number',    type: 'string', isOptional: true },
        { name: 'status',          type: 'string' },         // DRAFT | SUBMITTED | CONFIRMED | CANCELLED
        { name: 'items',           type: 'string' },         // JSON: Array<{skuId,name,qty,price}>
        { name: 'total_amount',    type: 'number' },
        { name: 'notes',           type: 'string', isOptional: true },
        { name: 'created_at',      type: 'number' },
        { name: 'updated_at',      type: 'number' },
        { name: 'deleted_at',      type: 'number', isOptional: true },
      ],
    }),

    // ─── Tasks ────────────────────────────────────────────────────────────
    tableSchema({
      name: 'tasks',
      columns: [
        { name: 'organization_id', type: 'string' },
        { name: 'agent_id',        type: 'string' },
        { name: 'customer_id',     type: 'string', isOptional: true },
        { name: 'visit_id',        type: 'string', isOptional: true },
        { name: 'title',           type: 'string' },
        { name: 'description',     type: 'string', isOptional: true },
        { name: 'status',          type: 'string' },         // PENDING | IN_PROGRESS | COMPLETED | SKIPPED
        { name: 'priority',        type: 'string' },         // LOW | MEDIUM | HIGH
        { name: 'due_date',        type: 'number', isOptional: true },
        { name: 'completed_at',    type: 'number', isOptional: true },
        { name: 'result',          type: 'string', isOptional: true },
        { name: 'created_at',      type: 'number' },
        { name: 'updated_at',      type: 'number' },
        { name: 'deleted_at',      type: 'number', isOptional: true },
      ],
    }),

    // ─── Outbox Operations ────────────────────────────────────────────────
    // Local-only table — tracks offline mutations waiting to be pushed to server.
    // Populated by M2-1c SyncManager.
    tableSchema({
      name: 'outbox_operations',
      columns: [
        { name: 'operation_id',     type: 'string' },        // UUIDv4 idempotency key
        { name: 'op_type',          type: 'string' },        // 'create' | 'update'
        { name: 'entity',           type: 'string' },        // 'visits' | 'orders' | 'tasks'
        { name: 'data',             type: 'string' },        // JSON payload
        { name: 'client_timestamp', type: 'number' },        // epoch ms
        { name: 'status',           type: 'string' },        // 'pending' | 'syncing' | 'synced' | 'failed'
        { name: 'retry_count',      type: 'number' },
        { name: 'last_error',       type: 'string', isOptional: true },
        { name: 'synced_at',        type: 'number', isOptional: true },
      ],
    }),
  ],
})
