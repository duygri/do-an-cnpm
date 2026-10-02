import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableCheck,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateProductImages1790850000000 implements MigrationInterface {
  name = 'CreateProductImages1790850000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!queryRunner.isTransactionActive) {
      throw new Error(
        'Cannot create product images without an active transaction.',
      );
    }

    await queryRunner.createTable(
      new Table({
        name: 'product_image',
        columns: [
          {
            name: 'product_image_id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          { name: 'product_id', type: 'integer', isNullable: false },
          { name: 'image_url', type: 'varchar', length: '2048' },
          {
            name: 'alt_text',
            type: 'varchar',
            length: '200',
            isNullable: true,
          },
          { name: 'sort_order', type: 'integer', default: 0 },
          { name: 'is_primary', type: 'boolean', default: false },
        ],
      }),
    );
    await queryRunner.createCheckConstraint(
      'product_image',
      new TableCheck({
        name: 'CHK_product_image_sort_order_nonnegative',
        expression: '"sort_order" >= 0',
      }),
    );
    await queryRunner.createForeignKey(
      'product_image',
      new TableForeignKey({
        name: 'FK_product_image_product',
        columnNames: ['product_id'],
        referencedTableName: 'product',
        referencedColumnNames: ['product_id'],
        onDelete: 'CASCADE',
      }),
    );
    await queryRunner.createIndex(
      'product_image',
      new TableIndex({
        name: 'IDX_product_image_product_sort',
        columnNames: ['product_id', 'sort_order', 'product_image_id'],
      }),
    );
    await queryRunner.createIndex(
      'product_image',
      new TableIndex({
        name: 'UQ_product_image_primary',
        columnNames: ['product_id'],
        isUnique: true,
        where: '"is_primary" = true',
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (!queryRunner.isTransactionActive) {
      throw new Error(
        'Cannot remove product images without an active transaction.',
      );
    }

    await queryRunner.dropTable('product_image');
  }
}
