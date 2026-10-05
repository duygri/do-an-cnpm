import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Category } from './category.entity';
import { ProductImage } from './product-image.entity';
import { ProductVariant } from './product-variant.entity';

@Entity({ name: 'product' })
@Index('IDX_product_category_id', ['categoryId'])
export class Product {
  @PrimaryGeneratedColumn({ name: 'product_id', type: 'integer' })
  productId!: number;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  brand!: string | null;

  @Column({ type: 'varchar', length: 30, default: 'active' })
  status!: string;

  @Column({ name: 'category_id', type: 'integer' })
  categoryId!: number;

  @ManyToOne(() => Category, (category) => category.products, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'category_id',
    referencedColumnName: 'categoryId',
    foreignKeyConstraintName: 'FK_product_category',
  })
  category!: Category;

  @OneToMany(() => ProductVariant, (variant) => variant.product)
  variants!: ProductVariant[];

  @OneToMany(() => ProductImage, (image) => image.product)
  images!: ProductImage[];
}
