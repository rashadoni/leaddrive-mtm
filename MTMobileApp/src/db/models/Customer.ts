import { Model } from '@nozbe/watermelondb'
import { field, readonly, date } from '@nozbe/watermelondb/decorators'

export type CustomerCategory = 'A' | 'B' | 'C'
export type CustomerStatus = 'ACTIVE' | 'INACTIVE'

export class Customer extends Model {
  static table = 'customers'

  @field('organization_id') organizationId!: string
  /** Optional — not all customers have an org-specific code */
  @field('code') code!: string | null
  @field('name') name!: string
  @field('category') category!: CustomerCategory
  @field('status') status!: CustomerStatus
  @field('address') address!: string | null
  @field('city') city!: string | null
  @field('district') district!: string | null
  @field('latitude') latitude!: number | null
  @field('longitude') longitude!: number | null
  @field('phone') phone!: string | null
  @field('contact_person') contactPerson!: string | null
  @field('notes') notes!: string | null
  @field('geofence_radius') geofenceRadius!: number | null

  @readonly @date('created_at') createdAt!: Date
  @date('updated_at') updatedAt!: Date
  @field('deleted_at') deletedAt!: number | null
}
