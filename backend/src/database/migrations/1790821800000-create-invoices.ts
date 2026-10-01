import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableCheck,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateInvoices1790821800000 implements MigrationInterface {
  name = 'CreateInvoices1790821800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!queryRunner.isTransactionActive) {
      throw new Error('Cannot create invoices without an active transaction.');
    }

    await queryRunner.createTable(
      new Table({
        name: 'invoice',
        columns: [
          {
            name: 'invoice_id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'issued_date',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'total_amount',
            type: 'numeric',
            precision: 24,
            scale: 2,
            isNullable: false,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '20',
            default: "'issued'",
          },
          {
            name: 'order_id',
            type: 'integer',
            isNullable: false,
          },
        ],
      }),
    );
    await queryRunner.createCheckConstraint(
      'invoice',
      new TableCheck({
        name: 'CHK_invoice_total_nonnegative',
        expression: '"total_amount" >= 0',
      }),
    );
    await queryRunner.createCheckConstraint(
      'invoice',
      new TableCheck({
        name: 'CHK_invoice_status',
        expression: '"status" = \'issued\'',
      }),
    );
    await queryRunner.createForeignKey(
      'invoice',
      new TableForeignKey({
        name: 'FK_invoice_order',
        columnNames: ['order_id'],
        referencedTableName: 'sales_order',
        referencedColumnNames: ['order_id'],
        onDelete: 'RESTRICT',
      }),
    );
    await queryRunner.createIndex(
      'invoice',
      new TableIndex({
        name: 'UQ_invoice_order_id',
        columnNames: ['order_id'],
        isUnique: true,
      }),
    );

    await queryRunner.query(`
      INSERT INTO "invoice" ("issued_date", "total_amount", "status", "order_id")
      SELECT COALESCE("payment_confirmed_at", "order_date", CURRENT_TIMESTAMP),
             "total_amount",
             'issued',
             "order_id"
      FROM "sales_order"
      WHERE "payment_status" = 'paid'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (!queryRunner.isTransactionActive) {
      throw new Error('Cannot remove invoices without an active transaction.');
    }

    await queryRunner.query('LOCK TABLE "invoice" IN ACCESS EXCLUSIVE MODE');

    const invoices: unknown = await queryRunner.query(
      'SELECT 1 FROM "invoice" LIMIT 1',
    );
    if (!Array.isArray(invoices)) {
      throw new Error(
        'Cannot verify whether invoice records exist; invoice rollback was stopped.',
      );
    }
    if (invoices.length > 0) {
      throw new Error(
        'Cannot roll back invoice records while invoices exist; issued invoice history must be preserved.',
      );
    }

    await queryRunner.dropTable('invoice');
  }
}
