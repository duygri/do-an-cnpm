import {
  MigrationInterface,
  QueryRunner,
  TableCheck,
  TableColumn,
  TableForeignKey,
} from 'typeorm';

export class AddCodPaymentConfirmation1790730000000 implements MigrationInterface {
  name = 'AddCodPaymentConfirmation1790730000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!queryRunner.isTransactionActive) {
      throw new Error(
        'Cannot add COD payment confirmation without an active transaction.',
      );
    }

    await queryRunner.addColumns('sales_order', [
      new TableColumn({
        name: 'payment_confirmed_at',
        type: 'timestamptz',
        isNullable: true,
      }),
      new TableColumn({
        name: 'payment_confirmed_by_employee_id',
        type: 'integer',
        isNullable: true,
      }),
    ]);
    await queryRunner.createForeignKey(
      'sales_order',
      new TableForeignKey({
        name: 'FK_sales_order_payment_confirmed_by_employee',
        columnNames: ['payment_confirmed_by_employee_id'],
        referencedTableName: 'employee',
        referencedColumnNames: ['employee_id'],
        onDelete: 'RESTRICT',
      }),
    );

    await queryRunner.dropCheckConstraint(
      'sales_order',
      'CHK_sales_order_payment_status',
    );
    await queryRunner.createCheckConstraint(
      'sales_order',
      new TableCheck({
        name: 'CHK_sales_order_payment_status',
        expression: "\"payment_status\" IN ('unpaid', 'paid')",
      }),
    );
    await queryRunner.createCheckConstraint(
      'sales_order',
      new TableCheck({
        name: 'CHK_sales_order_payment_method',
        expression: '"payment_method" IS NULL OR "payment_method" = \'cod\'',
      }),
    );
    await queryRunner.createCheckConstraint(
      'sales_order',
      new TableCheck({
        name: 'CHK_sales_order_payment_confirmation',
        expression: `CASE WHEN "payment_status" = 'unpaid' THEN "payment_confirmed_at" IS NULL AND "payment_confirmed_by_employee_id" IS NULL WHEN "payment_status" = 'paid' THEN "payment_method" IS NOT DISTINCT FROM 'cod' AND "payment_confirmed_at" IS NOT NULL AND "payment_confirmed_by_employee_id" IS NOT NULL ELSE FALSE END`,
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (!queryRunner.isTransactionActive) {
      throw new Error(
        'Cannot remove COD payment confirmation without an active transaction.',
      );
    }

    await queryRunner.query(
      'LOCK TABLE "sales_order" IN ACCESS EXCLUSIVE MODE',
    );

    const paidRows: Array<{ paidCount: string }> = await queryRunner.query(
      'SELECT COUNT(*) AS "paidCount" FROM "sales_order" WHERE "payment_status" = \'paid\'',
    );
    if (Number(paidRows[0]?.paidCount ?? 0) > 0) {
      throw new Error(
        'Cannot roll back COD payment confirmation while paid orders exist; paid confirmations must be preserved.',
      );
    }

    await queryRunner.dropCheckConstraint(
      'sales_order',
      'CHK_sales_order_payment_confirmation',
    );
    await queryRunner.dropForeignKey(
      'sales_order',
      'FK_sales_order_payment_confirmed_by_employee',
    );
    await queryRunner.dropColumns('sales_order', [
      'payment_confirmed_at',
      'payment_confirmed_by_employee_id',
    ]);
    await queryRunner.dropCheckConstraint(
      'sales_order',
      'CHK_sales_order_payment_method',
    );
    await queryRunner.dropCheckConstraint(
      'sales_order',
      'CHK_sales_order_payment_status',
    );
    await queryRunner.createCheckConstraint(
      'sales_order',
      new TableCheck({
        name: 'CHK_sales_order_payment_status',
        expression: '"payment_status" IN (\'unpaid\')',
      }),
    );
  }
}
