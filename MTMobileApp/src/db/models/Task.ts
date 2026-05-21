import { Model } from '@nozbe/watermelondb'
import { field, relation, readonly, date } from '@nozbe/watermelondb/decorators'
import type { Relation } from '@nozbe/watermelondb'
import type { Customer } from './Customer'

export type TaskStatus   = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED'
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH'

export class Task extends Model {
  static table = 'tasks'

  static associations = {
    customers: { type: 'belongs_to' as const, key: 'customer_id' },
  }

  @field('organization_id') organizationId!: string
  @field('agent_id') agentId!: string
  @field('customer_id') customerId!: string | null
  @field('visit_id') visitId!: string | null
  @field('title') title!: string
  @field('description') description!: string | null
  @field('status') status!: TaskStatus
  @field('priority') priority!: TaskPriority
  @field('due_date') dueDate!: number | null
  @field('completed_at') completedAt!: number | null
  @field('result') result!: string | null

  @readonly @date('created_at') createdAt!: Date
  @date('updated_at') updatedAt!: Date
  @field('deleted_at') deletedAt!: number | null

  @relation('customers', 'customer_id') customer!: Relation<Customer>
}
