import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableCheck,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateOrderPacking1790710000000 implements MigrationInterface {
  name = 'CreateOrderPacking1790710000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!queryRunner.isTransactionActive) {
      throw new Error(
        'Cannot apply order packing migration without an active transaction.',
      );
    }

    await queryRunner.dropCheckConstraint(
      'sales_order',
      'CHK_sales_order_status',
    );
    await queryRunner.createCheckConstraint(
      'sales_order',
      new TableCheck({
        name: 'CHK_sales_order_status',
        expression: `"status" IN ('pending', 'packed', 'cancelled')`,
      }),
    );
    await queryRunner.createIndex(
      'sales_order',
      new TableIndex({
        name: 'IDX_sales_order_status_order_date',
        columnNames: ['status', 'order_date'],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'packing',
        columns: [
          {
            name: 'packing_id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'packing_date',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'packing_type',
            type: 'varchar',
            length: '10',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '20',
            default: "'packed'",
          },
          { name: 'note', type: 'text', isNullable: true },
          { name: 'employee_id', type: 'integer' },
          { name: 'order_id', type: 'integer' },
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'FK_packing_employee',
            columnNames: ['employee_id'],
            referencedTableName: 'employee',
            referencedColumnNames: ['employee_id'],
            onDelete: 'RESTRICT',
          }),
          new TableForeignKey({
            name: 'FK_packing_order',
            columnNames: ['order_id'],
            referencedTableName: 'sales_order',
            referencedColumnNames: ['order_id'],
            onDelete: 'RESTRICT',
          }),
        ],
        checks: [
          new TableCheck({
            name: 'CHK_packing_type',
            expression: `"packing_type" IS NULL OR "packing_type" IN ('bag', 'box')`,
          }),
          new TableCheck({
            name: 'CHK_packing_status',
            expression: `"status" IN ('packed')`,
          }),
        ],
      }),
    );
    await queryRunner.createIndex(
      'packing',
      new TableIndex({
        name: 'IDX_packing_employee_id',
        columnNames: ['employee_id'],
      }),
    );
    await queryRunner.createIndex(
      'packing',
      new TableIndex({
        name: 'UQ_packing_order_id',
        columnNames: ['order_id'],
        isUnique: true,
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (!queryRunner.isTransactionActive) {
      throw new Error(
        'Cannot revert order packing migration without an active transaction.',
      );
    }

    await queryRunner.query(
      'LOCK TABLE "sales_order" IN ACCESS EXCLUSIVE MODE',
    );
    await queryRunner.query('LOCK TABLE "packing" IN ACCESS EXCLUSIVE MODE');

    const counts: Array<{
      packed_order_count: string;
      packing_row_count: string;
    }> = await queryRunner.query(
      `SELECT (SELECT COUNT(*) FROM "sales_order" WHERE "status" = 'packed') AS packed_order_count, (SELECT COUNT(*) FROM "packing") AS packing_row_count`,
    );

    if (
      Number(counts[0].packed_order_count) > 0 ||
      Number(counts[0].packing_row_count) > 0
    ) {
      throw new Error(
        'Cannot revert order packing migration while packed sales orders or packing records exist. Resolve those records before retrying.',
      );
    }

    await queryRunner.dropIndex(
      'sales_order',
      'IDX_sales_order_status_order_date',
    );
    await queryRunner.dropTable('packing');
    await queryRunner.dropCheckConstraint(
      'sales_order',
      'CHK_sales_order_status',
    );
    await queryRunner.createCheckConstraint(
      'sales_order',
      new TableCheck({
        name: 'CHK_sales_order_status',
        expression: `"status" IN ('pending', 'cancelled')`,
      }),
    );
  }
}
