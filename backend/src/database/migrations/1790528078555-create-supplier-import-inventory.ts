import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableCheck,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateSupplierImportInventory1790528078555 implements MigrationInterface {
  name = 'CreateSupplierImportInventory1790528078555';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'supplier',
        columns: [
          {
            name: 'supplier_id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          { name: 'name', type: 'varchar', length: '160' },
          { name: 'address', type: 'text', isNullable: true },
          { name: 'email', type: 'varchar', length: '254', isNullable: true },
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'stock_import',
        columns: [
          {
            name: 'import_id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'import_date',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
          { name: 'total_amount', type: 'numeric', precision: 24, scale: 2 },
          { name: 'note', type: 'text', isNullable: true },
          { name: 'supplier_id', type: 'integer' },
          { name: 'employee_id', type: 'integer' },
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'FK_stock_import_supplier',
            columnNames: ['supplier_id'],
            referencedTableName: 'supplier',
            referencedColumnNames: ['supplier_id'],
            onDelete: 'RESTRICT',
          }),
          new TableForeignKey({
            name: 'FK_stock_import_employee',
            columnNames: ['employee_id'],
            referencedTableName: 'employee',
            referencedColumnNames: ['employee_id'],
            onDelete: 'RESTRICT',
          }),
        ],
        checks: [
          new TableCheck({
            name: 'CHK_stock_import_total_nonnegative',
            expression: '"total_amount" >= 0',
          }),
        ],
      }),
    );
    await queryRunner.createIndex(
      'stock_import',
      new TableIndex({
        name: 'IDX_stock_import_supplier_id',
        columnNames: ['supplier_id'],
      }),
    );
    await queryRunner.createIndex(
      'stock_import',
      new TableIndex({
        name: 'IDX_stock_import_employee_id',
        columnNames: ['employee_id'],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'import_detail',
        columns: [
          { name: 'import_id', type: 'integer', isPrimary: true },
          { name: 'variant_id', type: 'integer', isPrimary: true },
          { name: 'quantity', type: 'integer' },
          { name: 'unit_price', type: 'numeric', precision: 12, scale: 2 },
          { name: 'subtotal', type: 'numeric', precision: 22, scale: 2 },
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'FK_import_detail_import',
            columnNames: ['import_id'],
            referencedTableName: 'stock_import',
            referencedColumnNames: ['import_id'],
            onDelete: 'RESTRICT',
          }),
          new TableForeignKey({
            name: 'FK_import_detail_variant',
            columnNames: ['variant_id'],
            referencedTableName: 'product_variant',
            referencedColumnNames: ['variant_id'],
            onDelete: 'RESTRICT',
          }),
        ],
        checks: [
          new TableCheck({
            name: 'CHK_import_detail_quantity_positive',
            expression: '"quantity" > 0',
          }),
          new TableCheck({
            name: 'CHK_import_detail_unit_price_nonnegative',
            expression: '"unit_price" >= 0',
          }),
          new TableCheck({
            name: 'CHK_import_detail_subtotal_nonnegative',
            expression: '"subtotal" >= 0',
          }),
        ],
      }),
    );
    await queryRunner.createIndex(
      'import_detail',
      new TableIndex({
        name: 'IDX_import_detail_variant_id',
        columnNames: ['variant_id'],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'inventory_movement',
        columns: [
          {
            name: 'movement_id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          { name: 'variant_id', type: 'integer' },
          { name: 'direction', type: 'varchar', length: '8' },
          { name: 'movement_type', type: 'varchar', length: '20' },
          { name: 'quantity', type: 'integer' },
          {
            name: 'effective_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
          { name: 'employee_id', type: 'integer' },
          { name: 'import_id', type: 'integer', isNullable: true },
          { name: 'note', type: 'text', isNullable: true },
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'FK_inventory_movement_variant',
            columnNames: ['variant_id'],
            referencedTableName: 'product_variant',
            referencedColumnNames: ['variant_id'],
            onDelete: 'RESTRICT',
          }),
          new TableForeignKey({
            name: 'FK_inventory_movement_employee',
            columnNames: ['employee_id'],
            referencedTableName: 'employee',
            referencedColumnNames: ['employee_id'],
            onDelete: 'RESTRICT',
          }),
          new TableForeignKey({
            name: 'FK_inventory_movement_import_detail',
            columnNames: ['import_id', 'variant_id'],
            referencedTableName: 'import_detail',
            referencedColumnNames: ['import_id', 'variant_id'],
            onDelete: 'RESTRICT',
          }),
        ],
        checks: [
          new TableCheck({
            name: 'CHK_inventory_movement_direction',
            expression: "\"direction\" IN ('in', 'out')",
          }),
          new TableCheck({
            name: 'CHK_inventory_movement_kind',
            expression:
              "\"movement_type\" IN ('opening', 'import', 'sale', 'adjustment')",
          }),
          new TableCheck({
            name: 'CHK_inventory_movement_direction_kind',
            expression:
              "((\"movement_type\" IN ('opening', 'import') AND \"direction\" = 'in') OR (\"movement_type\" = 'sale' AND \"direction\" = 'out') OR \"movement_type\" = 'adjustment')",
          }),
          new TableCheck({
            name: 'CHK_inventory_movement_quantity',
            expression:
              '"quantity" >= 0 AND ("movement_type" = \'opening\' OR "quantity" > 0)',
          }),
          new TableCheck({
            name: 'CHK_inventory_movement_import_source',
            expression:
              '(("movement_type" = \'import\' AND "import_id" IS NOT NULL) OR ("movement_type" <> \'import\' AND "import_id" IS NULL))',
          }),
        ],
      }),
    );
    await queryRunner.createIndex(
      'inventory_movement',
      new TableIndex({
        name: 'IDX_inventory_movement_variant_effective',
        columnNames: ['variant_id', 'effective_at'],
      }),
    );
    await queryRunner.createIndex(
      'inventory_movement',
      new TableIndex({
        name: 'IDX_inventory_movement_employee_id',
        columnNames: ['employee_id'],
      }),
    );
    await queryRunner.createIndex(
      'inventory_movement',
      new TableIndex({
        name: 'UQ_inventory_movement_opening_variant',
        columnNames: ['variant_id'],
        isUnique: true,
        where: '"movement_type" = \'opening\'',
      }),
    );
    await queryRunner.createIndex(
      'inventory_movement',
      new TableIndex({
        name: 'UQ_inventory_movement_import_variant',
        columnNames: ['import_id', 'variant_id'],
        isUnique: true,
        where: '"import_id" IS NOT NULL',
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('inventory_movement');
    await queryRunner.dropTable('import_detail');
    await queryRunner.dropTable('stock_import');
    await queryRunner.dropTable('supplier');
  }
}
