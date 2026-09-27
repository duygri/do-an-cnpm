import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from './product.entity';

@Entity({ name: 'product_variant' })
@Check('CHK_product_variant_price_nonnegative', '"price" >= 0')
@Index('IDX_product_variant_product_id', ['productId'])
export class ProductVariant {
  @PrimaryGeneratedColumn({ name: 'variant_id', type: 'integer' })
  variantId!: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  size!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  color!: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  price!: string;

  @Column({ name: 'product_id', type: 'integer' })
  productId!: number;

  @ManyToOne(() => Product, (product) => product.variants, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'product_id',
    referencedColumnName: 'productId',
    foreignKeyConstraintName: 'FK_product_variant_product',
  })
  product!: Product;
}
