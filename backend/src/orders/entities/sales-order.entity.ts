import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Customer } from '../../customers/entities/customer.entity';
import { OrderDetail } from './order-detail.entity';
import { Packing } from './packing.entity';

export type SalesOrderPaymentStatus = 'unpaid';
export type SalesOrderStatus = 'pending' | 'packed' | 'cancelled';

@Entity({ name: 'sales_order' })
@Check('CHK_sales_order_discount_nonnegative', '"discount_amount" >= 0')
@Check('CHK_sales_order_shipping_nonnegative', '"shipping_fee" >= 0')
@Check('CHK_sales_order_total_nonnegative', '"total_amount" >= 0')
@Check('CHK_sales_order_payment_status', '"payment_status" IN (\'unpaid\')')
@Check(
  'CHK_sales_order_status',
  "\"status\" IN ('pending', 'packed', 'cancelled')",
)
@Index('IDX_sales_order_customer_id', ['customerId'])
@Index('IDX_sales_order_order_date', ['orderDate'])
@Index('IDX_sales_order_status_order_date', ['status', 'orderDate'])
export class SalesOrder {
  @PrimaryGeneratedColumn({ name: 'order_id', type: 'integer' })
  orderId!: number;

  @CreateDateColumn({ name: 'order_date', type: 'timestamptz' })
  orderDate!: Date;

  @Column({ name: 'customer_id', type: 'integer' })
  customerId!: number;

  @Column({ name: 'recipient_name', type: 'varchar', length: 120 })
  recipientName!: string;

  @Column({ name: 'recipient_phone', type: 'varchar', length: 30 })
  recipientPhone!: string;

  @Column({ name: 'shipping_address', type: 'text' })
  shippingAddress!: string;

  @Column({
    name: 'discount_amount',
    type: 'numeric',
    precision: 24,
    scale: 2,
    default: 0,
  })
  discountAmount!: string;

  @Column({
    name: 'shipping_fee',
    type: 'numeric',
    precision: 24,
    scale: 2,
    default: 0,
  })
  shippingFee!: string;

  @Column({ name: 'total_amount', type: 'numeric', precision: 24, scale: 2 })
  totalAmount!: string;

  @Column({
    name: 'payment_method',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  paymentMethod!: string | null;

  @Column({
    name: 'payment_status',
    type: 'varchar',
    length: 20,
    default: 'unpaid',
  })
  paymentStatus!: SalesOrderPaymentStatus;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: SalesOrderStatus;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @ManyToOne(() => Customer, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'customer_id',
    referencedColumnName: 'customerId',
    foreignKeyConstraintName: 'FK_sales_order_customer',
  })
  customer!: Customer;

  @OneToMany(() => OrderDetail, (detail) => detail.order, { cascade: false })
  details!: OrderDetail[];

  @OneToOne(() => Packing, (packing) => packing.order, { cascade: false })
  packing!: Packing | null;
}
