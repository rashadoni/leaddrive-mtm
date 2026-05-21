import { Model } from '@nozbe/watermelondb'
import { field, readonly, date } from '@nozbe/watermelondb/decorators'

export type CustomerCategory = 'A' | 'B' | 'C'
export type CustomerStatus = 'ACTIVE' | 'INACTIVE'

export class Customer extends Model {
  static table = 'customers'

  @field('organization_id') organizationId!: string
  @field('code') code!: string
  @field('name') name!: string
  @field('category') category!: CustomerCategory
  @field('status') status!: CustomerStatus
  @field('address') address!: string
  @field('city') city!: string
  @field('district') district!: string
  @field('latitude') latitude!: number | null
  @field('longitude') longitude!: number | null
  @field('phone') phone!: string
  @field('contact_person') contactPerson!: string
  @field('notes') notes!: string
  @field('geofence_radius') geofenceRadius!: number | null

  /** epoch ms */
  @readonly @date('created_at') createdAt!: Date
  @date('updated_at') updatedAt!: Date
  @field('deleted_at') deletedAt!: number | null
}
