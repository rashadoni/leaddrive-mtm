import { Model } from '@nozbe/watermelondb'
import { field, readonly, date } from '@nozbe/watermelondb/decorators'

export class SkuCategory extends Model {
  static table = 'sku_categories'

  @field('organization_id') organizationId!: string
  @field('parent_id') parentId!: string | null
  @field('name') name!: string
  @field('name_az') nameAz!: string
  @field('name_en') nameEn!: string
  @field('code') code!: string
  @field('icon_url') iconUrl!: string
  @field('sort_order') sortOrder!: number
  @field('is_active') isActive!: boolean

  @readonly @date('created_at') createdAt!: Date
  @date('updated_at') updatedAt!: Date
}
