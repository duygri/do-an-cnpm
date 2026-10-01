import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SalesOrder } from '../../orders/entities/sales-order.entity';

export type PaymentProvider = 'payos';
export type PaymentAttemptStatus =
  | 'creating'
  | 'pending'
  | 'paid'
  | 'cancelled'
  | 'expired'
  | 'failed'
  | 'reconciliation_required';

@Entity({ name: 'payment_attempt' })
@Check('CHK_payment_attempt_provider', `"provider" IN ('payos')`)
@Check(
  'CHK_payment_attempt_status',
  `"status" IN ('creating', 'pending', 'paid', 'cancelled', 'expired', 'failed', 'reconciliation_required')`,
)
@Check(
  'CHK_payment_attempt_provider_order_code_positive',
  '"provider_order_code" > 0',
)
@Check(
  'CHK_payment_attempt_amount_whole_vnd',
  '"amount" > 0 AND "amount" = trunc("amount") AND "amount" <= 9007199254740991',
)
@Check(
  'CHK_payment_attempt_observed_amount_paid_whole_vnd',
  '"observed_amount_paid" IS NULL OR ("observed_amount_paid" >= 0 AND "observed_amount_paid" = trunc("observed_amount_paid"))',
)
@Index('UQ_payment_attempt_order_id', ['orderId'], { unique: true })
@Index('UQ_payment_attempt_provider_order_code', ['providerOrderCode'], {
  unique: true,
})
@Index('UQ_payment_attempt_provider_reference', ['providerReference'], {
  unique: true,
  where: '"provider_reference" IS NOT NULL',
})
@Index('IDX_payment_attempt_setup_lease_expiry', ['setupLeaseExpiresAt'], {
  where: '"status" = \'creating\'',
})
@Index('IDX_payment_attempt_expiration', ['expiresAt'], {
  where: '"status" = \'pending\'',
})
export class PaymentAttempt {
  @PrimaryGeneratedColumn({ name: 'payment_attempt_id', type: 'integer' })
  paymentAttemptId!: number;

  @Column({ name: 'order_id', type: 'integer' })
  orderId!: number;

  @Column({ name: 'provider', type: 'varchar', length: 20 })
  provider!: PaymentProvider;

  @Column({ name: 'provider_order_code', type: 'integer' })
  providerOrderCode!: number;

  @Column({
    name: 'provider_payment_link_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  providerPaymentLinkId!: string | null;

  @Column({ name: 'checkout_url', type: 'text', nullable: true })
  checkoutUrl!: string | null;

  @Column({ name: 'amount', type: 'numeric', precision: 24, scale: 2 })
  amount!: string;

  @Column({ name: 'status', type: 'varchar', length: 32 })
  status!: PaymentAttemptStatus;

  @Column({ name: 'setup_lease_expires_at', type: 'timestamptz' })
  setupLeaseExpiresAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt!: Date | null;

  @Column({
    name: 'provider_reference',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  providerReference!: string | null;

  @Column({
    name: 'observed_amount_paid',
    type: 'numeric',
    precision: 24,
    scale: 2,
    nullable: true,
  })
  observedAmountPaid!: string | null;

  @Column({ name: 'reconciliation_reason', type: 'text', nullable: true })
  reconciliationReason!: string | null;

  @Column({ name: 'reconciliation_at', type: 'timestamptz', nullable: true })
  reconciliationAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToOne(() => SalesOrder, (order) => order.paymentAttempt, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'order_id',
    referencedColumnName: 'orderId',
    foreignKeyConstraintName: 'FK_payment_attempt_order',
  })
  order!: SalesOrder;
}
