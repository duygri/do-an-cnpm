import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class InitialCatalog1790512639861 implements MigrationInterface {
  name = 'InitialCatalog1790512639861';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'category',
        columns: [
          {
            name: 'category_id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          { name: 'name', type: 'varchar', length: '120' },
          { name: 'description', type: 'text', isNullable: true },
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'product',
        columns: [
          {
            name: 'product_id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          { name: 'name', type: 'varchar', length: '200' },
          { name: 'description', type: 'text', isNullable: true },
          { name: 'brand', type: 'varchar', length: '120', isNullable: true },
          {
            name: 'status',
            type: 'varchar',
            length: '30',
            default: "'active'",
          },
          { name: 'category_id', type: 'integer' },
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'FK_product_category',
            columnNames: ['category_id'],
            referencedTableName: 'category',
            referencedColumnNames: ['category_id'],
            onDelete: 'RESTRICT',
          }),
        ],
      }),
    );
    await queryRunner.createIndex(
      'product',
      new TableIndex({
        name: 'IDX_product_category_id',
        columnNames: ['category_id'],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'product_variant',
        columns: [
          {
            name: 'variant_id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          { name: 'size', type: 'varchar', length: '50', isNullable: true },
          { name: 'color', type: 'varchar', length: '50', isNullable: true },
          { name: 'price', type: 'numeric', precision: 12, scale: 2 },
          { name: 'product_id', type: 'integer' },
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'FK_product_variant_product',
            columnNames: ['product_id'],
            referencedTableName: 'product',
            referencedColumnNames: ['product_id'],
            onDelete: 'RESTRICT',
          }),
        ],
        checks: [
          {
            name: 'CHK_product_variant_price_nonnegative',
            expression: '"price" >= 0',
          },
        ],
      }),
    );
    await queryRunner.createIndex(
      'product_variant',
      new TableIndex({
        name: 'IDX_product_variant_product_id',
        columnNames: ['product_id'],
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('product_variant');
    await queryRunner.dropTable('product');
    await queryRunner.dropTable('category');
  }
}
