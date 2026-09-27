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
import { Employee } from '../../employees/entities/employee.entity';
import { ImportDetail } from '../../imports/entities/import-detail.entity';

export type InventoryDirection = 'in' | 'out';
export type InventoryMovementKind =
  'opening' | 'import' | 'sale' | 'adjustment';

@Entity({ name: 'inventory_movement' })
@Check('CHK_inventory_movement_direction', "\"direction\" IN ('in', 'out')")
@Check(
  'CHK_inventory_movement_kind',
  "\"movement_type\" IN ('opening', 'import', 'sale', 'adjustment')",
)
@Check(
  'CHK_inventory_movement_direction_kind',
  "((\"movement_type\" IN ('opening', 'import') AND \"direction\" = 'in') OR (\"movement_type\" = 'sale' AND \"direction\" = 'out') OR \"movement_type\" = 'adjustment')",
)
@Check(
  'CHK_inventory_movement_quantity',
  '"quantity" >= 0 AND ("movement_type" = \'opening\' OR "quantity" > 0)',
)
@Check(
  'CHK_inventory_movement_import_source',
  '(("movement_type" = \'import\' AND "import_id" IS NOT NULL) OR ("movement_type" <> \'import\' AND "import_id" IS NULL))',
)
@Index('IDX_inventory_movement_variant_effective', ['variantId', 'effectiveAt'])
@Index('IDX_inventory_movement_employee_id', ['employeeId'])
@Index('UQ_inventory_movement_opening_variant', ['variantId'], {
  unique: true,
  where: '"movement_type" = \'opening\'',
})
@Index('UQ_inventory_movement_import_variant', ['importId', 'variantId'], {
  unique: true,
  where: '"import_id" IS NOT NULL',
})
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

  @Column({ name: 'employee_id', type: 'integer' })
  employeeId!: number;

  @Column({ name: 'import_id', type: 'integer', nullable: true })
  importId!: number | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @ManyToOne(() => ProductVariant, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'variant_id',
    referencedColumnName: 'variantId',
    foreignKeyConstraintName: 'FK_inventory_movement_variant',
  })
  variant!: ProductVariant;

  @ManyToOne(() => Employee, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'employee_id',
    referencedColumnName: 'employeeId',
    foreignKeyConstraintName: 'FK_inventory_movement_employee',
  })
  employee!: Employee;

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
}
