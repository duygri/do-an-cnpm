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
import { StockImport } from './stock-import.entity';

@Entity({ name: 'import_detail' })
@Check('CHK_import_detail_quantity_positive', '"quantity" > 0')
@Check('CHK_import_detail_unit_price_nonnegative', '"unit_price" >= 0')
@Check('CHK_import_detail_subtotal_nonnegative', '"subtotal" >= 0')
@Index('IDX_import_detail_variant_id', ['variantId'])
export class ImportDetail {
  @PrimaryColumn({ name: 'import_id', type: 'integer' })
  importId!: number;

  @PrimaryColumn({ name: 'variant_id', type: 'integer' })
  variantId!: number;

  @Column({ type: 'integer' })
  quantity!: number;

  @Column({ name: 'unit_price', type: 'numeric', precision: 12, scale: 2 })
  unitPrice!: string;

  @Column({ type: 'numeric', precision: 22, scale: 2 })
  subtotal!: string;

  @ManyToOne(() => StockImport, (stockImport) => stockImport.details, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'import_id',
    referencedColumnName: 'importId',
    foreignKeyConstraintName: 'FK_import_detail_import',
  })
  stockImport!: StockImport;

  @ManyToOne(() => ProductVariant, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'variant_id',
    referencedColumnName: 'variantId',
    foreignKeyConstraintName: 'FK_import_detail_variant',
  })
  variant!: ProductVariant;
}
