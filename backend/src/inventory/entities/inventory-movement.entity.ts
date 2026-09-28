import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ProductVariant } from '../../catalog/entities/product-variant.entity';
import { Customer } from '../../customers/entities/customer.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { ImportDetail } from '../../imports/entities/import-detail.entity';
import { OrderDetail } from '../../orders/entities/order-detail.entity';

export type InventoryDirection = 'in' | 'out';
export type InventoryMovementKind =
  'opening' | 'import' | 'sale' | 'sale_cancellation' | 'adjustment';

@Entity({ name: 'inventory_movement' })
@Check(
  'CHK_inventory_movement_kind',
  "\"movement_type\" IN ('opening', 'import', 'sale', 'sale_cancellation', 'adjustment')",
)
@Check(
  'CHK_inventory_movement_direction_kind',
  "((\"movement_type\" IN ('opening', 'import', 'sale_cancellation') AND \"direction\" = 'in') OR (\"movement_type\" = 'sale' AND \"direction\" = 'out') OR (\"movement_type\" = 'adjustment' AND \"direction\" IN ('in', 'out')))",
)
@Check(
  'CHK_inventory_movement_quantity',
  '"quantity" >= 0 AND ("movement_type" = \'opening\' OR "quantity" > 0)',
)
@Check(
  'CHK_inventory_movement_source',
  '(("movement_type" = \'import\' AND "import_id" IS NOT NULL AND "order_id" IS NULL) OR ("movement_type" IN (\'sale\', \'sale_cancellation\') AND "import_id" IS NULL AND "order_id" IS NOT NULL) OR ("movement_type" IN (\'opening\', \'adjustment\') AND "import_id" IS NULL AND "order_id" IS NULL))',
)
@Check(
  'CHK_inventory_movement_actor',
  '(("movement_type" IN (\'opening\', \'import\', \'adjustment\') AND "employee_id" IS NOT NULL AND "customer_id" IS NULL) OR ("movement_type" IN (\'sale\', \'sale_cancellation\') AND "employee_id" IS NULL AND "customer_id" IS NOT NULL))',
)
@Index('IDX_inventory_movement_variant_effective', ['variantId', 'effectiveAt'])
@Index('IDX_inventory_movement_employee_id', ['employeeId'])
@Index('IDX_inventory_movement_customer_id', ['customerId'])
@Index('UQ_inventory_movement_opening_variant', ['variantId'], {
  unique: true,
  where: '"movement_type" = \'opening\'',
})
@Index('UQ_inventory_movement_import_variant', ['importId', 'variantId'], {
  unique: true,
  where: '"import_id" IS NOT NULL',
})
@Index('UQ_inventory_movement_sale_order_line', ['orderId', 'variantId'], {
  unique: true,
  where: '"movement_type" = \'sale\' AND "order_id" IS NOT NULL',
})
@Index(
  'UQ_inventory_movement_sale_cancellation_order_line',
  ['orderId', 'variantId'],
  {
    unique: true,
    where: '"movement_type" = \'sale_cancellation\' AND "order_id" IS NOT NULL',
  },
)
export class InventoryMovement {
  @PrimaryGeneratedColumn({ name: 'movement_id', type: 'integer' })
  movementId!: number;

  @Column({ name: 'variant_id', type: 'integer' })
  variantId!: number;

  @Column({ type: 'varchar', length: 8 })
  direction!: InventoryDirection;

  @Column({ name: 'movement_type', type: 'varchar', length: 20 })
  movementType!: InventoryMovementKind;

  @Column({ type: 'integer' })
  quantity!: number;

  @Column({
    name: 'effective_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  effectiveAt!: Date;

  @Column({ name: 'employee_id', type: 'integer', nullable: true })
  employeeId!: number | null;

  @Column({ name: 'import_id', type: 'integer', nullable: true })
  importId!: number | null;

  @Column({ name: 'customer_id', type: 'integer', nullable: true })
  customerId!: number | null;

  @Column({ name: 'order_id', type: 'integer', nullable: true })
  orderId!: number | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @ManyToOne(() => ProductVariant, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'variant_id',
    referencedColumnName: 'variantId',
    foreignKeyConstraintName: 'FK_inventory_movement_variant',
  })
  variant!: ProductVariant;

  @ManyToOne(() => Employee, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'employee_id',
    referencedColumnName: 'employeeId',
    foreignKeyConstraintName: 'FK_inventory_movement_employee',
  })
  employee!: Employee | null;

  @ManyToOne(() => ImportDetail, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn([
    {
      name: 'import_id',
      referencedColumnName: 'importId',
      foreignKeyConstraintName: 'FK_inventory_movement_import_detail',
    },
    { name: 'variant_id', referencedColumnName: 'variantId' },
  ])
  importDetail!: ImportDetail | null;

  @ManyToOne(() => Customer, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'customer_id',
    referencedColumnName: 'customerId',
    foreignKeyConstraintName: 'FK_inventory_movement_customer',
  })
  customer!: Customer | null;

  @ManyToOne(() => OrderDetail, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn([
    {
      name: 'order_id',
      referencedColumnName: 'orderId',
      foreignKeyConstraintName: 'FK_inventory_movement_order_detail',
    },
    { name: 'variant_id', referencedColumnName: 'variantId' },
  ])
  orderDetail!: OrderDetail | null;
}
