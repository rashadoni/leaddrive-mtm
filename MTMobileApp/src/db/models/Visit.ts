import { Model } from '@nozbe/watermelondb'
import { field, relation, readonly, date } from '@nozbe/watermelondb/decorators'
import type { Relation } from '@nozbe/watermelondb'
import type { Customer } from './Customer'

export type VisitStatus = 'CHECKED_IN' | 'CHECKED_OUT'

export class Visit extends Model {
  static table = 'visits'

  static associations = {
    customers: { type: 'belongs_to' as const, key: 'customer_id' },
  }

  @field('organization_id') organizationId!: string
  @field('agent_id') agentId!: string
  @field('customer_id') customerId!: string
  @field('status') status!: VisitStatus
  @field('check_in_at') checkInAt!: number
  @field('check_out_at') checkOutAt!: number | null
  @field('check_in_lat') checkInLat!: number | null
  @field('check_in_lng') checkInLng!: number | null
  @field('check_out_lat') checkOutLat!: number | null
  @field('check_out_lng') checkOutLng!: number | null
  @field('duration') duration!: number | null
  @field('notes') notes!: string
  @field('tasks_completed') tasksCompleted!: number
  @field('tasks_total') tasksTotal!: number

  @readonly @date('created_at') createdAt!: Date
  @date('updated_at') updatedAt!: Date
  @field('deleted_at') deletedAt!: number | null

  @relation('customers', 'customer_id') customer!: Relation<Customer>
}
