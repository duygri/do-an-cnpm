import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableCheck,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateCustomerOrders1790700000000 implements MigrationInterface {
  name = 'CreateCustomerOrders1790700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'sales_order',
        columns: [
          {
            name: 'order_id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'order_date',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
          { name: 'customer_id', type: 'integer' },
          { name: 'recipient_name', type: 'varchar', length: '120' },
          { name: 'recipient_phone', type: 'varchar', length: '30' },
          { name: 'shipping_address', type: 'text' },
          {
            name: 'discount_amount',
            type: 'numeric',
            precision: 24,
            scale: 2,
            default: '0.00',
          },
          {
            name: 'shipping_fee',
            type: 'numeric',
            precision: 24,
            scale: 2,
            default: '0.00',
          },
          {
            name: 'total_amount',
            type: 'numeric',
            precision: 24,
            scale: 2,
          },
          {
            name: 'payment_method',
            type: 'varchar',
            length: '30',
            isNullable: true,
          },
          {
            name: 'payment_status',
            type: 'varchar',
            length: '20',
            default: "'unpaid'",
          },
          {
            name: 'status',
            type: 'varchar',
            length: '20',
            default: "'pending'",
          },
          { name: 'note', type: 'text', isNullable: true },
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'FK_sales_order_customer',
            columnNames: ['customer_id'],
            referencedTableName: 'customer',
            referencedColumnNames: ['customer_id'],
            onDelete: 'RESTRICT',
          }),
        ],
        checks: [
          new TableCheck({
            name: 'CHK_sales_order_discount_nonnegative',
            expression: '"discount_amount" >= 0',
          }),
          new TableCheck({
            name: 'CHK_sales_order_shipping_nonnegative',
            expression: '"shipping_fee" >= 0',
          }),
          new TableCheck({
            name: 'CHK_sales_order_total_nonnegative',
            expression: '"total_amount" >= 0',
          }),
          new TableCheck({
            name: 'CHK_sales_order_payment_status',
            expression: '"payment_status" IN (\'unpaid\')',
          }),
          new TableCheck({
            name: 'CHK_sales_order_status',
            expression: "\"status\" IN ('pending', 'cancelled')",
          }),
        ],
      }),
    );
    await queryRunner.createIndex(
      'sales_order',
      new TableIndex({
        name: 'IDX_sales_order_customer_id',
        columnNames: ['customer_id'],
      }),
    );
    await queryRunner.createIndex(
      'sales_order',
      new TableIndex({
        name: 'IDX_sales_order_order_date',
        columnNames: ['order_date'],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'order_detail',
        columns: [
          { name: 'order_id', type: 'integer', isPrimary: true },
          { name: 'variant_id', type: 'integer', isPrimary: true },
          { name: 'quantity', type: 'integer' },
          { name: 'unit_price', type: 'numeric', precision: 12, scale: 2 },
          { name: 'subtotal', type: 'numeric', precision: 22, scale: 2 },
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'FK_order_detail_order',
            columnNames: ['order_id'],
            referencedTableName: 'sales_order',
            referencedColumnNames: ['order_id'],
            onDelete: 'RESTRICT',
          }),
          new TableForeignKey({
            name: 'FK_order_detail_variant',
            columnNames: ['variant_id'],
            referencedTableName: 'product_variant',
            referencedColumnNames: ['variant_id'],
            onDelete: 'RESTRICT',
          }),
        ],
        checks: [
          new TableCheck({
            name: 'CHK_order_detail_quantity_positive',
            expression: '"quantity" > 0',
          }),
          new TableCheck({
            name: 'CHK_order_detail_unit_price_nonnegative',
            expression: '"unit_price" >= 0',
          }),
          new TableCheck({
            name: 'CHK_order_detail_subtotal_nonnegative',
            expression: '"subtotal" >= 0',
          }),
        ],
      }),
    );
    await queryRunner.createIndex(
      'order_detail',
      new TableIndex({
        name: 'IDX_order_detail_variant_id',
        columnNames: ['variant_id'],
      }),
    );

    await queryRunner.addColumn(
      'inventory_movement',
      new TableColumn({
        name: 'customer_id',
        type: 'integer',
        isNullable: true,
      }),
    );
    await queryRunner.addColumn(
      'inventory_movement',
      new TableColumn({ name: 'order_id', type: 'integer', isNullable: true }),
    );
    await queryRunner.query(
      'ALTER TABLE "inventory_movement" ALTER COLUMN "employee_id" DROP NOT NULL',
    );

    await queryRunner.dropCheckConstraint(
      'inventory_movement',
      'CHK_inventory_movement_direction',
    );
    await queryRunner.dropCheckConstraint(
      'inventory_movement',
      'CHK_inventory_movement_kind',
    );
    await queryRunner.dropCheckConstraint(
      'inventory_movement',
      'CHK_inventory_movement_direction_kind',
    );
    await queryRunner.dropCheckConstraint(
      'inventory_movement',
      'CHK_inventory_movement_import_source',
    );
    await queryRunner.createCheckConstraint(
      'inventory_movement',
      new TableCheck({
        name: 'CHK_inventory_movement_kind',
        expression:
          "\"movement_type\" IN ('opening', 'import', 'sale', 'sale_cancellation', 'adjustment')",
      }),
    );
    await queryRunner.createCheckConstraint(
      'inventory_movement',
      new TableCheck({
        name: 'CHK_inventory_movement_direction_kind',
        expression:
          "((\"movement_type\" IN ('opening', 'import', 'sale_cancellation') AND \"direction\" = 'in') OR (\"movement_type\" = 'sale' AND \"direction\" = 'out') OR (\"movement_type\" = 'adjustment' AND \"direction\" IN ('in', 'out')))",
      }),
    );

    // NOT VALID keeps pre-existing employee-attributed, orderless sale rows while PostgreSQL enforces both rules for every new or updated row.
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

    await queryRunner.createForeignKey(
      'inventory_movement',
      new TableForeignKey({
        name: 'FK_inventory_movement_customer',
        columnNames: ['customer_id'],
        referencedTableName: 'customer',
        referencedColumnNames: ['customer_id'],
        onDelete: 'RESTRICT',
      }),
    );
    await queryRunner.createForeignKey(
      'inventory_movement',
      new TableForeignKey({
        name: 'FK_inventory_movement_order_detail',
        columnNames: ['order_id', 'variant_id'],
        referencedTableName: 'order_detail',
        referencedColumnNames: ['order_id', 'variant_id'],
        onDelete: 'RESTRICT',
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

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "inventory_movement" WHERE "order_id" IS NOT NULL AND "movement_type" IN ('sale', 'sale_cancellation')`,
    );

    await queryRunner.dropIndex(
      'inventory_movement',
      'UQ_inventory_movement_sale_order_line',
    );
    await queryRunner.dropIndex(
      'inventory_movement',
      'UQ_inventory_movement_sale_cancellation_order_line',
    );
    await queryRunner.dropIndex(
      'inventory_movement',
      'IDX_inventory_movement_customer_id',
    );
    await queryRunner.dropForeignKey(
      'inventory_movement',
      'FK_inventory_movement_order_detail',
    );
    await queryRunner.dropForeignKey(
      'inventory_movement',
      'FK_inventory_movement_customer',
    );
    await queryRunner.dropCheckConstraint(
      'inventory_movement',
      'CHK_inventory_movement_actor',
    );
    await queryRunner.dropCheckConstraint(
      'inventory_movement',
      'CHK_inventory_movement_source',
    );
    await queryRunner.dropCheckConstraint(
      'inventory_movement',
      'CHK_inventory_movement_direction_kind',
    );
    await queryRunner.dropCheckConstraint(
      'inventory_movement',
      'CHK_inventory_movement_kind',
    );
    await queryRunner.dropColumn('inventory_movement', 'customer_id');
    await queryRunner.dropColumn('inventory_movement', 'order_id');
    await queryRunner.query(
      'ALTER TABLE "inventory_movement" ALTER COLUMN "employee_id" SET NOT NULL',
    );

    await queryRunner.createCheckConstraint(
      'inventory_movement',
      new TableCheck({
        name: 'CHK_inventory_movement_direction',
        expression: "\"direction\" IN ('in', 'out')",
      }),
    );
    await queryRunner.createCheckConstraint(
      'inventory_movement',
      new TableCheck({
        name: 'CHK_inventory_movement_kind',
        expression:
          "\"movement_type\" IN ('opening', 'import', 'sale', 'adjustment')",
      }),
    );
    await queryRunner.createCheckConstraint(
      'inventory_movement',
      new TableCheck({
        name: 'CHK_inventory_movement_direction_kind',
        expression:
          "((\"movement_type\" IN ('opening', 'import') AND \"direction\" = 'in') OR (\"movement_type\" = 'sale' AND \"direction\" = 'out') OR \"movement_type\" = 'adjustment')",
      }),
    );
    await queryRunner.createCheckConstraint(
      'inventory_movement',
      new TableCheck({
        name: 'CHK_inventory_movement_import_source',
        expression:
          '(("movement_type" = \'import\' AND "import_id" IS NOT NULL) OR ("movement_type" <> \'import\' AND "import_id" IS NULL))',
      }),
    );

    await queryRunner.dropTable('order_detail');
    await queryRunner.dropTable('sales_order');
  }
}
