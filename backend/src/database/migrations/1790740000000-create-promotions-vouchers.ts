import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableCheck,
  TableColumn,
  TableForeignKey,
  TableIndex,
  TableUnique,
} from 'typeorm';

export class CreatePromotionsVouchers1790740000000
  implements MigrationInterface
{
  name = 'CreatePromotionsVouchers1790740000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'promotion',
        columns: [
          {
            name: 'promotion_id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          { name: 'name', type: 'varchar', length: '120' },
          { name: 'description', type: 'text', isNullable: true },
          { name: 'start_date', type: 'date' },
          { name: 'end_date', type: 'date' },
          { name: 'status', type: 'varchar', length: '20', default: "'active'" },
        ],
        checks: [
          new TableCheck({
            name: 'CHK_promotion_status',
            expression: `"status" IN ('active', 'inactive')`,
          }),
          new TableCheck({
            name: 'CHK_promotion_date_range',
            expression: '"start_date" <= "end_date"',
          }),
        ],
      }),
    );
    await queryRunner.createIndex(
      'promotion',
      new TableIndex({
        name: 'IDX_promotion_status_dates',
        columnNames: ['status', 'start_date', 'end_date'],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'promotion_detail',
        columns: [
          {
            name: 'voucher_id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          { name: 'promotion_id', type: 'integer' },
          { name: 'code', type: 'varchar', length: '64' },
          { name: 'name', type: 'varchar', length: '120' },
          { name: 'type', type: 'varchar', length: '20' },
          {
            name: 'discount_value',
            type: 'numeric',
            precision: 24,
            scale: 2,
          },
          { name: 'start_date', type: 'date' },
          { name: 'end_date', type: 'date' },
          { name: 'min_price', type: 'numeric', precision: 24, scale: 2 },
          {
            name: 'max_discount',
            type: 'numeric',
            precision: 24,
            scale: 2,
            isNullable: true,
          },
          { name: 'quantity', type: 'integer' },
          { name: 'status', type: 'varchar', length: '20', default: "'active'" },
        ],
        uniques: [
          new TableUnique({
            name: 'UQ_promotion_detail_code',
            columnNames: ['code'],
          }),
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'FK_promotion_detail_promotion',
            columnNames: ['promotion_id'],
            referencedTableName: 'promotion',
            referencedColumnNames: ['promotion_id'],
            onDelete: 'RESTRICT',
          }),
        ],
        checks: [
          new TableCheck({
            name: 'CHK_promotion_detail_code_canonical',
            expression: `"code" ~ '^[A-Z0-9_-]+$'`,
          }),
          new TableCheck({
            name: 'CHK_promotion_detail_status',
            expression: `"status" IN ('active', 'inactive')`,
          }),
          new TableCheck({
            name: 'CHK_promotion_detail_date_range',
            expression: '"start_date" <= "end_date"',
          }),
          new TableCheck({
            name: 'CHK_promotion_detail_type',
            expression: `"type" IN ('fixed', 'percentage')`,
          }),
          new TableCheck({
            name: 'CHK_promotion_detail_discount_positive',
            expression: '"discount_value" > 0',
          }),
          new TableCheck({
            name: 'CHK_promotion_detail_min_price_nonnegative',
            expression: '"min_price" >= 0',
          }),
          new TableCheck({
            name: 'CHK_promotion_detail_max_discount',
            expression:
              `"max_discount" IS NULL OR ("type" = 'percentage' AND "max_discount" > 0)`,
          }),
          new TableCheck({
            name: 'CHK_promotion_detail_percentage_range',
            expression: `"type" <> 'percentage' OR "discount_value" <= 100`,
          }),
          new TableCheck({
            name: 'CHK_promotion_detail_quantity_positive',
            expression: '"quantity" > 0',
          }),
        ],
      }),
    );
    await queryRunner.createIndex(
      'promotion_detail',
      new TableIndex({
        name: 'IDX_promotion_detail_promotion_id',
        columnNames: ['promotion_id'],
      }),
    );
    await queryRunner.createIndex(
      'promotion_detail',
      new TableIndex({
        name: 'IDX_promotion_detail_status_dates',
        columnNames: ['status', 'start_date', 'end_date'],
      }),
    );

    await queryRunner.addColumn(
      'sales_order',
      new TableColumn({
        name: 'voucher_id',
        type: 'integer',
        isNullable: true,
      }),
    );
    await queryRunner.createForeignKey(
      'sales_order',
      new TableForeignKey({
        name: 'FK_sales_order_voucher',
        columnNames: ['voucher_id'],
        referencedTableName: 'promotion_detail',
        referencedColumnNames: ['voucher_id'],
        onDelete: 'RESTRICT',
      }),
    );
    await queryRunner.createIndex(
      'sales_order',
      new TableIndex({
        name: 'IDX_sales_order_voucher_id_status',
        columnNames: ['voucher_id', 'status'],
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (!queryRunner.isTransactionActive) {
      throw new Error(
        'Cannot remove promotions and vouchers without an active transaction.',
      );
    }

    await queryRunner.query('LOCK TABLE "promotion" IN ACCESS EXCLUSIVE MODE');
    await queryRunner.query(
      'LOCK TABLE "promotion_detail" IN ACCESS EXCLUSIVE MODE',
    );
    await queryRunner.query(
      'LOCK TABLE "sales_order" IN ACCESS EXCLUSIVE MODE',
    );

    const voucherOrders: unknown = await queryRunner.query(
      'SELECT 1 FROM "sales_order" WHERE "voucher_id" IS NOT NULL LIMIT 1',
    );
    if (!Array.isArray(voucherOrders)) {
      throw new Error(
        'Cannot verify whether voucher orders exist; promotion and voucher rollback was stopped.',
      );
    }
    if (voucherOrders.length > 0) {
      throw new Error(
        'Cannot roll back promotions and vouchers while sales orders reference vouchers; historical voucher references must be preserved.',
      );
    }

    await queryRunner.dropForeignKey('sales_order', 'FK_sales_order_voucher');
    await queryRunner.dropIndex(
      'sales_order',
      'IDX_sales_order_voucher_id_status',
    );
    await queryRunner.dropColumn('sales_order', 'voucher_id');
    await queryRunner.dropTable('promotion_detail');
    await queryRunner.dropTable('promotion');
  }
}
