import { Model } from '@nozbe/watermelondb'
import { field, readonly, date } from '@nozbe/watermelondb/decorators'

export class Sku extends Model {
  static table = 'skus'

  @field('organization_id') organizationId!: string
  @field('category_id') categoryId!: string | null
  @field('code') code!: string
  @field('external_id') externalId!: string | null
  @field('barcode') barcode!: string | null
  @field('name') name!: string
  @field('name_az') nameAz!: string | null
  @field('name_en') nameEn!: string | null
  @field('description') description!: string | null
  @field('brand') brand!: string | null
  @field('unit') unit!: string
  @field('pack_size') packSize!: number
  @field('base_price') basePrice!: number
  @field('currency') currency!: string
  @field('image_url') imageUrl!: string | null
  @field('thumbnail_url') thumbnailUrl!: string | null
  @field('is_active') isActive!: boolean
  @field('weight') weight!: number | null
  @field('volume_ml') volumeMl!: number | null

  @readonly @date('created_at') createdAt!: Date
  @date('updated_at') updatedAt!: Date
}
