import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { ProductVariant } from '../../catalog/entities/product-variant.entity';
import { SalesOrder } from './sales-order.entity';

@Entity({ name: 'order_detail' })
@Check('CHK_order_detail_quantity_positive', '"quantity" > 0')
@Check('CHK_order_detail_unit_price_nonnegative', '"unit_price" >= 0')
@Check('CHK_order_detail_subtotal_nonnegative', '"subtotal" >= 0')
@Index('IDX_order_detail_variant_id', ['variantId'])
export class OrderDetail {
  @PrimaryColumn({ name: 'order_id', type: 'integer' })
  orderId!: number;

  @PrimaryColumn({ name: 'variant_id', type: 'integer' })
  variantId!: number;

  @Column({ type: 'integer' })
  quantity!: number;

  @Column({ name: 'unit_price', type: 'numeric', precision: 12, scale: 2 })
  unitPrice!: string;

  @Column({ type: 'numeric', precision: 22, scale: 2 })
  subtotal!: string;

  @ManyToOne(() => SalesOrder, (order) => order.details, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'order_id',
    referencedColumnName: 'orderId',
    foreignKeyConstraintName: 'FK_order_detail_order',
  })
  order!: SalesOrder;

  @ManyToOne(() => ProductVariant, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'variant_id',
    referencedColumnName: 'variantId',
    foreignKeyConstraintName: 'FK_order_detail_variant',
  })
  variant!: ProductVariant;
}
