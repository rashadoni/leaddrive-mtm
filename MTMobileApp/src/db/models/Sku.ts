import { Model } from '@nozbe/watermelondb'
import { field, readonly, date } from '@nozbe/watermelondb/decorators'

export class Sku extends Model {
  static table = 'skus'

  @field('organization_id') organizationId!: string
  @field('category_id') categoryId!: string | null
  @field('code') code!: string
  @field('external_id') externalId!: string
  @field('barcode') barcode!: string
  @field('name') name!: string
  @field('name_az') nameAz!: string
  @field('name_en') nameEn!: string
  @field('description') description!: string
  @field('brand') brand!: string
  @field('unit') unit!: string
  @field('pack_size') packSize!: number
  @field('base_price') basePrice!: number
  @field('currency') currency!: string
  @field('image_url') imageUrl!: string
  @field('thumbnail_url') thumbnailUrl!: string
  @field('is_active') isActive!: boolean
  @field('weight') weight!: number | null
  @field('volume_ml') volumeMl!: number | null

  @readonly @date('created_at') createdAt!: Date
  @date('updated_at') updatedAt!: Date
}
