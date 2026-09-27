import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { Supplier } from '../../suppliers/entities/supplier.entity';
import { ImportDetail } from './import-detail.entity';

@Entity({ name: 'stock_import' })
@Check('CHK_stock_import_total_nonnegative', '"total_amount" >= 0')
@Index('IDX_stock_import_supplier_id', ['supplierId'])
@Index('IDX_stock_import_employee_id', ['employeeId'])
export class StockImport {
  @PrimaryGeneratedColumn({ name: 'import_id', type: 'integer' })
  importId!: number;

  @CreateDateColumn({ name: 'import_date', type: 'timestamptz' })
  importDate!: Date;

  @Column({ name: 'total_amount', type: 'numeric', precision: 24, scale: 2 })
  totalAmount!: string;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({ name: 'supplier_id', type: 'integer' })
  supplierId!: number;

  @Column({ name: 'employee_id', type: 'integer' })
  employeeId!: number;

  @ManyToOne(() => Supplier, (supplier) => supplier.imports, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'supplier_id',
    referencedColumnName: 'supplierId',
    foreignKeyConstraintName: 'FK_stock_import_supplier',
  })
  supplier!: Supplier;

  @ManyToOne(() => Employee, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'employee_id',
    referencedColumnName: 'employeeId',
    foreignKeyConstraintName: 'FK_stock_import_employee',
  })
  employee!: Employee;

  @OneToMany(() => ImportDetail, (detail) => detail.stockImport, {
    cascade: false,
  })
  details!: ImportDetail[];
}
