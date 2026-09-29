import {
  Check,
  Column,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PromotionDetail } from './promotion-detail.entity';

export type PromotionStatus = 'active' | 'inactive';

@Entity({ name: 'promotion' })
@Check(
  'CHK_promotion_status',
  `"status" IN ('active', 'inactive')`,
)
@Check('CHK_promotion_date_range', '"start_date" <= "end_date"')
@Index('IDX_promotion_status_dates', ['status', 'startDate', 'endDate'])
export class Promotion {
  @PrimaryGeneratedColumn({ name: 'promotion_id', type: 'integer' })
  promotionId!: number;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'start_date', type: 'date' })
  startDate!: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate!: string;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status!: PromotionStatus;

  @OneToMany(() => PromotionDetail, (detail) => detail.promotion)
  details!: PromotionDetail[];
}
