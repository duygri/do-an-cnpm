import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from './product.entity';

@Entity({ name: 'product_image' })
@Index('IDX_product_image_product_sort', [
  'productId',
  'sortOrder',
  'productImageId',
])
@Index('UQ_product_image_primary', ['productId'], {
  unique: true,
  where: '"is_primary" = true',
})
export class ProductImage {
  @PrimaryGeneratedColumn({ name: 'product_image_id', type: 'integer' })
  productImageId!: number;

  @Column({ name: 'product_id', type: 'integer' })
  productId!: number;

  @Column({ name: 'image_url', type: 'varchar', length: 2048 })
  imageUrl!: string;

  @Column({ name: 'alt_text', type: 'varchar', length: 200, nullable: true })
  altText!: string | null;

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder!: number;

  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary!: boolean;

  @ManyToOne(() => Product, (product) => product.images, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'product_id',
    referencedColumnName: 'productId',
    foreignKeyConstraintName: 'FK_product_image_product',
  })
  product!: Product;
}
