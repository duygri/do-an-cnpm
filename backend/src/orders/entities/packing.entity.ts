import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { SalesOrder } from './sales-order.entity';

export type PackingType = 'bag' | 'box';
export type PackingStatus = 'packed';

@Entity({ name: 'packing' })
@Check(
  'CHK_packing_type',
  `"packing_type" IS NULL OR "packing_type" IN ('bag', 'box')`,
)
@Check('CHK_packing_status', `"status" IN ('packed')`)
@Index('IDX_packing_employee_id', ['employeeId'])
@Index('UQ_packing_order_id', ['orderId'], { unique: true })
export class Packing {
  @PrimaryGeneratedColumn({ name: 'packing_id', type: 'integer' })
  packingId!: number;

  @CreateDateColumn({ name: 'packing_date', type: 'timestamptz' })
  packingDate!: Date;

  @Column({ name: 'packing_type', type: 'varchar', length: 10, nullable: true })
  packingType!: PackingType | null;

  @Column({ type: 'varchar', length: 20, default: 'packed' })
  status!: PackingStatus;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({ name: 'employee_id', type: 'integer' })
  employeeId!: number;

  @Column({ name: 'order_id', type: 'integer' })
  orderId!: number;

  @ManyToOne(() => Employee, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'employee_id',
    referencedColumnName: 'employeeId',
    foreignKeyConstraintName: 'FK_packing_employee',
  })
  employee!: Employee;

  @OneToOne(() => SalesOrder, (order) => order.packing, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'order_id',
    referencedColumnName: 'orderId',
    foreignKeyConstraintName: 'FK_packing_order',
  })
  order!: SalesOrder;
}
