import { Model } from '@nozbe/watermelondb'
import { field, json, relation, readonly, date } from '@nozbe/watermelondb/decorators'
import type { Relation } from '@nozbe/watermelondb'
import type { Customer } from './Customer'

export type OrderStatus = 'DRAFT' | 'SUBMITTED' | 'CONFIRMED' | 'CANCELLED'

export interface OrderItem {
  skuId: string | null
  name: string
  qty: number
  price: number
}

const sanitizeItems = (raw: unknown): OrderItem[] => {
  if (Array.isArray(raw)) {
    return raw.filter(
      (it): it is OrderItem =>
        it !== null &&
        typeof it === 'object' &&
        typeof (it as OrderItem).qty === 'number' &&
        typeof (it as OrderItem).price === 'number',
    )
  }
  return []
}

export class Order extends Model {
  static table = 'orders'

  static associations = {
    customers: { type: 'belongs_to' as const, key: 'customer_id' },
  }

  @field('organization_id') organizationId!: string
  @field('agent_id') agentId!: string
  @field('customer_id') customerId!: string
  @field('visit_id') visitId!: string | null
  @field('order_number') orderNumber!: string
  @field('status') status!: OrderStatus
  /** Deserialized order line items — stored as JSON string in SQLite */
  @json('items', sanitizeItems) items!: OrderItem[]
  @field('total_amount') totalAmount!: number
  @field('notes') notes!: string

  @readonly @date('created_at') createdAt!: Date
  @date('updated_at') updatedAt!: Date
  @field('deleted_at') deletedAt!: number | null

  @relation('customers', 'customer_id') customer!: Relation<Customer>
}
