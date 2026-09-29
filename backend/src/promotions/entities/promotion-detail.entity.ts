import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Promotion } from './promotion.entity';

export type PromotionDetailStatus = 'active' | 'inactive';
export type PromotionDetailType = 'fixed' | 'percentage';

@Entity({ name: 'promotion_detail' })
@Unique('UQ_promotion_detail_code', ['code'])
@Check('CHK_promotion_detail_code_canonical', `"code" ~ '^[A-Z0-9_-]+$'`)
@Check('CHK_promotion_detail_status', `"status" IN ('active', 'inactive')`)
@Check('CHK_promotion_detail_date_range', '"start_date" <= "end_date"')
@Check('CHK_promotion_detail_type', `"type" IN ('fixed', 'percentage')`)
@Check('CHK_promotion_detail_discount_positive', '"discount_value" > 0')
@Check('CHK_promotion_detail_min_price_nonnegative', '"min_price" >= 0')
@Check(
  'CHK_promotion_detail_max_discount',
  `"max_discount" IS NULL OR ("type" = 'percentage' AND "max_discount" > 0)`,
)
@Check(
  'CHK_promotion_detail_percentage_range',
  `"type" <> 'percentage' OR "discount_value" <= 100`,
)
@Check('CHK_promotion_detail_quantity_positive', '"quantity" > 0')
@Index('IDX_promotion_detail_promotion_id', ['promotionId'])
@Index('IDX_promotion_detail_status_dates', ['status', 'startDate', 'endDate'])
export class PromotionDetail {
  @PrimaryGeneratedColumn({ name: 'voucher_id', type: 'integer' })
  voucherId!: number;

  @Column({ name: 'promotion_id', type: 'integer' })
  promotionId!: number;

  @Column({ type: 'varchar', length: 64 })
  code!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 20 })
  type!: PromotionDetailType;

  @Column({
    name: 'discount_value',
    type: 'numeric',
    precision: 24,
    scale: 2,
  })
  discountValue!: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate!: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate!: string;

  @Column({ name: 'min_price', type: 'numeric', precision: 24, scale: 2 })
  minPrice!: string;

  @Column({
    name: 'max_discount',
    type: 'numeric',
    precision: 24,
    scale: 2,
    nullable: true,
  })
  maxDiscount!: string | null;

  @Column({ type: 'integer' })
  quantity!: number;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status!: PromotionDetailStatus;

  @ManyToOne(() => Promotion, (promotion) => promotion.details, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'promotion_id',
    referencedColumnName: 'promotionId',
    foreignKeyConstraintName: 'FK_promotion_detail_promotion',
  })
  promotion!: Promotion;
}
