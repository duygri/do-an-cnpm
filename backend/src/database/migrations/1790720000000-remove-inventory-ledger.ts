import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableCheck,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class RemoveInventoryLedger1790720000000 implements MigrationInterface {
  name = 'RemoveInventoryLedger1790720000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!queryRunner.isTransactionActive) {
      throw new Error(
        'Cannot remove inventory ledger without an active transaction.',
      );
    }

    // This permanently deletes ledger records; supplier and import documents remain intact.
    await queryRunner.dropTable('inventory_movement');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (!queryRunner.isTransactionActive) {
      throw new Error(
        'Cannot recreate inventory ledger without an active transaction.',
      );
    }

    // Rollback recreates only an empty schema. Ledger records deleted by up cannot be restored.
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
          { name: 'employee_id', type: 'integer', isNullable: true },
          { name: 'import_id', type: 'integer', isNullable: true },
          { name: 'note', type: 'text', isNullable: true },
          { name: 'customer_id', type: 'integer', isNullable: true },
          { name: 'order_id', type: 'integer', isNullable: true },
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
          new TableForeignKey({
            name: 'FK_inventory_movement_customer',
            columnNames: ['customer_id'],
            referencedTableName: 'customer',
            referencedColumnNames: ['customer_id'],
            onDelete: 'RESTRICT',
          }),
          new TableForeignKey({
            name: 'FK_inventory_movement_order_detail',
            columnNames: ['order_id', 'variant_id'],
            referencedTableName: 'order_detail',
            referencedColumnNames: ['order_id', 'variant_id'],
            onDelete: 'RESTRICT',
          }),
        ],
        checks: [
          new TableCheck({
            name: 'CHK_inventory_movement_quantity',
            expression:
              '"quantity" >= 0 AND ("movement_type" = \'opening\' OR "quantity" > 0)',
          }),
          new TableCheck({
            name: 'CHK_inventory_movement_kind',
            expression:
              "\"movement_type\" IN ('opening', 'import', 'sale', 'sale_cancellation', 'adjustment')",
          }),
          new TableCheck({
            name: 'CHK_inventory_movement_direction_kind',
            expression:
              "((\"movement_type\" IN ('opening', 'import', 'sale_cancellation') AND \"direction\" = 'in') OR (\"movement_type\" = 'sale' AND \"direction\" = 'out') OR (\"movement_type\" = 'adjustment' AND \"direction\" IN ('in', 'out')))",
          }),
        ],
      }),
    );

    // NOT VALID matches the historical customer-order migration and is harmless on this empty table.
    await queryRunner.query(
      `ALTER TABLE "inventory_movement" ADD CONSTRAINT "CHK_inventory_movement_source" CHECK (("movement_type" = 'import' AND "import_id" IS NOT NULL AND "order_id" IS NULL) OR ("movement_type" IN ('sale', 'sale_cancellation') AND "import_id" IS NULL AND "order_id" IS NOT NULL) OR ("movement_type" IN ('opening', 'adjustment') AND "import_id" IS NULL AND "order_id" IS NULL)) NOT VALID`,
    );
    await queryRunner.query(
      `COMMENT ON CONSTRAINT "CHK_inventory_movement_source" ON "inventory_movement" IS 'NOT VALID preserves pre-existing orderless sale rows; PostgreSQL enforces the source rule for inserted or updated rows.'`,
    );
    await queryRunner.query(
      `ALTER TABLE "inventory_movement" ADD CONSTRAINT "CHK_inventory_movement_actor" CHECK (("movement_type" IN ('opening', 'import', 'adjustment') AND "employee_id" IS NOT NULL AND "customer_id" IS NULL) OR ("movement_type" IN ('sale', 'sale_cancellation') AND "employee_id" IS NULL AND "customer_id" IS NOT NULL)) NOT VALID`,
    );
    await queryRunner.query(
      `COMMENT ON CONSTRAINT "CHK_inventory_movement_actor" ON "inventory_movement" IS 'NOT VALID preserves pre-existing employee-attributed sale rows; PostgreSQL enforces exactly one actor by movement kind for inserted or updated rows.'`,
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
    await queryRunner.createIndex(
      'inventory_movement',
      new TableIndex({
        name: 'IDX_inventory_movement_customer_id',
        columnNames: ['customer_id'],
      }),
    );
    await queryRunner.createIndex(
      'inventory_movement',
      new TableIndex({
        name: 'UQ_inventory_movement_sale_order_line',
        columnNames: ['order_id', 'variant_id'],
        isUnique: true,
        where: '"movement_type" = \'sale\' AND "order_id" IS NOT NULL',
      }),
    );
    await queryRunner.createIndex(
      'inventory_movement',
      new TableIndex({
        name: 'UQ_inventory_movement_sale_cancellation_order_line',
        columnNames: ['order_id', 'variant_id'],
        isUnique: true,
        where:
          '"movement_type" = \'sale_cancellation\' AND "order_id" IS NOT NULL',
      }),
    );
  }
}
