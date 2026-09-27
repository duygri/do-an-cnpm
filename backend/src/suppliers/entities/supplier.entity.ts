import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { StockImport } from '../../imports/entities/stock-import.entity';

@Entity({ name: 'supplier' })
export class Supplier {
  @PrimaryGeneratedColumn({ name: 'supplier_id', type: 'integer' })
  supplierId!: number;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  address!: string | null;

  @Column({ type: 'varchar', length: 254, nullable: true })
  email!: string | null;

  @OneToMany(() => StockImport, (stockImport) => stockImport.supplier)
  imports!: StockImport[];
}
