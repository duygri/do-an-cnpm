import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SalesOrder } from '../../orders/entities/sales-order.entity';

export type InvoiceStatus = 'issued';

@Entity({ name: 'invoice' })
@Check('CHK_invoice_total_nonnegative', '"total_amount" >= 0')
@Check('CHK_invoice_status', '"status" = \'issued\'')
@Index('UQ_invoice_order_id', ['orderId'], { unique: true })
export class Invoice {
  @PrimaryGeneratedColumn({ name: 'invoice_id', type: 'integer' })
  invoiceId!: number;

  @CreateDateColumn({ name: 'issued_date', type: 'timestamptz' })
  issuedDate!: Date;

  @Column({ name: 'total_amount', type: 'numeric', precision: 24, scale: 2 })
  totalAmount!: string;

  @Column({ type: 'varchar', length: 20, default: 'issued' })
  status!: InvoiceStatus;

  @Column({ name: 'order_id', type: 'integer' })
  orderId!: number;

  @OneToOne(() => SalesOrder, (order) => order.invoice, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'order_id',
    referencedColumnName: 'orderId',
    foreignKeyConstraintName: 'FK_invoice_order',
  })
  order!: SalesOrder;
}
