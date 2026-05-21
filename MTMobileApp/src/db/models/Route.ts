import { Model } from '@nozbe/watermelondb'
import { field, children, readonly, date } from '@nozbe/watermelondb/decorators'
import type { Query } from '@nozbe/watermelondb'
import type { RoutePoint } from './RoutePoint'

export type RouteStatus = 'PLANNED' | 'ACTIVE' | 'COMPLETED'

export class Route extends Model {
  static table = 'routes'

  static associations = {
    route_points: { type: 'has_many' as const, foreignKey: 'route_id' },
  }

  @field('organization_id') organizationId!: string
  @field('agent_id') agentId!: string
  /** epoch ms, midnight UTC for the route date */
  @field('date') date!: number
  @field('name') name!: string | null
  @field('status') status!: RouteStatus
  @field('total_points') totalPoints!: number
  @field('visited_points') visitedPoints!: number
  @field('started_at') startedAt!: number | null
  @field('completed_at') completedAt!: number | null
  @field('notes') notes!: string | null

  @readonly @date('created_at') createdAt!: Date
  @date('updated_at') updatedAt!: Date
  @field('deleted_at') deletedAt!: number | null

  @children('route_points') routePoints!: Query<RoutePoint>
}
