import { Model } from '@nozbe/watermelondb'
import { field, relation } from '@nozbe/watermelondb/decorators'
import type { Relation } from '@nozbe/watermelondb'
import type { Route } from './Route'
import type { Customer } from './Customer'

export type RoutePointStatus = 'PENDING' | 'VISITED' | 'SKIPPED'

export class RoutePoint extends Model {
  static table = 'route_points'

  static associations = {
    routes:    { type: 'belongs_to' as const, key: 'route_id' },
    customers: { type: 'belongs_to' as const, key: 'customer_id' },
  }

  @field('route_id') routeId!: string
  @field('customer_id') customerId!: string
  @field('order_index') orderIndex!: number
  @field('status') status!: RoutePointStatus
  @field('planned_time') plannedTime!: number | null
  @field('visited_at') visitedAt!: number | null
  @field('notes') notes!: string
  @field('deleted_at') deletedAt!: number | null

  @relation('routes', 'route_id') route!: Relation<Route>
  @relation('customers', 'customer_id') customer!: Relation<Customer>
}
