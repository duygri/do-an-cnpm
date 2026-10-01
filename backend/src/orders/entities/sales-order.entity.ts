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
import { PromotionDetail } from '../../promotions/entities/promotion-detail.entity';
import { PaymentAttempt } from '../../payments/entities/payment-attempt.entity';
import { Invoice } from '../../invoices/entities/invoice.entity';

export type SalesOrderPaymentMethod = 'cod' | 'payos';
export type SalesOrderPaymentStatus = 'unpaid' | 'paid';
export type SalesOrderStatus = 'pending' | 'packed' | 'cancelled';

@Entity({ name: 'sales_order' })
@Check('CHK_sales_order_discount_nonnegative', '"discount_amount" >= 0')
@Check('CHK_sales_order_shipping_nonnegative', '"shipping_fee" >= 0')
@Check('CHK_sales_order_total_nonnegative', '"total_amount" >= 0')
@Check(
  'CHK_sales_order_payment_status',
  "\"payment_status\" IN ('unpaid', 'paid')",
)
@Check(
  'CHK_sales_order_payment_method',
  '"payment_method" IS NULL OR "payment_method" IN (\'cod\', \'payos\')',
)
@Check(
  'CHK_sales_order_payment_confirmation',
  `CASE WHEN "payment_status" = 'unpaid' THEN "payment_confirmed_at" IS NULL AND "payment_confirmed_by_employee_id" IS NULL WHEN "payment_status" = 'paid' AND "payment_method" IS NOT DISTINCT FROM 'cod' THEN "payment_confirmed_at" IS NOT NULL AND "payment_confirmed_by_employee_id" IS NOT NULL WHEN "payment_status" = 'paid' AND "payment_method" = 'payos' THEN "payment_confirmed_at" IS NOT NULL AND "payment_confirmed_by_employee_id" IS NULL ELSE FALSE END`,
)
@Check(
  'CHK_sales_order_idempotency',
  `("idempotency_key" IS NULL AND "request_fingerprint" IS NULL) OR ("idempotency_key" IS NOT NULL AND "request_fingerprint" IS NOT NULL AND "request_fingerprint" ~ '^[0-9a-f]{64}$')`,
)
@Check(
  'CHK_sales_order_status',
  "\"status\" IN ('pending', 'packed', 'cancelled')",
)
@Index('IDX_sales_order_customer_id', ['customerId'])
@Index('IDX_sales_order_order_date', ['orderDate'])
@Index('IDX_sales_order_status_order_date', ['status', 'orderDate'])
@Index('IDX_sales_order_voucher_id_status', ['voucherId', 'status'])
@Index(
  'UQ_sales_order_customer_idempotency_key',
  ['customerId', 'idempotencyKey'],
  {
    unique: true,
    where: '"idempotency_key" IS NOT NULL',
  },
)
export class SalesOrder {
  @PrimaryGeneratedColumn({ name: 'order_id', type: 'integer' })
  orderId!: number;

  @CreateDateColumn({ name: 'order_date', type: 'timestamptz' })
  orderDate!: Date;

  @Column({ name: 'customer_id', type: 'integer' })
  customerId!: number;

  @Column({ name: 'voucher_id', type: 'integer', nullable: true })
  voucherId!: number | null;

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
  paymentMethod!: SalesOrderPaymentMethod | null;

  @Column({
    name: 'payment_status',
    type: 'varchar',
    length: 20,
    default: 'unpaid',
  })
  paymentStatus!: SalesOrderPaymentStatus;

  @Column({
    name: 'payment_confirmed_at',
    type: 'timestamptz',
    nullable: true,
    select: false,
  })
  paymentConfirmedAt!: Date | null;

  @Column({
    name: 'payment_confirmed_by_employee_id',
    type: 'integer',
    nullable: true,
    select: false,
  })
  paymentConfirmedByEmployeeId!: number | null;

  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  idempotencyKey!: string | null;

  @Column({
    name: 'request_fingerprint',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  requestFingerprint!: string | null;

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

  @OneToOne(() => PaymentAttempt, (attempt) => attempt.order, {
    cascade: false,
  })
  paymentAttempt!: PaymentAttempt | null;

  @OneToOne(() => Invoice, (invoice) => invoice.order, { cascade: false })
  invoice!: Invoice | null;

  @ManyToOne(() => PromotionDetail, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'voucher_id',
    referencedColumnName: 'voucherId',
    foreignKeyConstraintName: 'FK_sales_order_voucher',
  })
  voucher!: PromotionDetail | null;
}
