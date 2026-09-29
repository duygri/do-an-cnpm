import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableCheck,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class AddPayosPayments1790750000000 implements MigrationInterface {
  name = 'AddPayosPayments1790750000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!queryRunner.isTransactionActive) {
      throw new Error(
        'Cannot add PayOS payments without an active transaction.',
      );
    }

    await queryRunner.addColumns('sales_order', [
      new TableColumn({
        name: 'idempotency_key',
        type: 'varchar',
        length: '255',
        isNullable: true,
      }),
      new TableColumn({
        name: 'request_fingerprint',
        type: 'varchar',
        length: '64',
        isNullable: true,
      }),
    ]);
    await queryRunner.createCheckConstraint(
      'sales_order',
      new TableCheck({
        name: 'CHK_sales_order_idempotency',
        expression: `("idempotency_key" IS NULL AND "request_fingerprint" IS NULL) OR ("idempotency_key" IS NOT NULL AND "request_fingerprint" IS NOT NULL AND "request_fingerprint" ~ '^[0-9a-f]{64}$')`,
      }),
    );
    await queryRunner.createIndex(
      'sales_order',
      new TableIndex({
        name: 'UQ_sales_order_customer_idempotency_key',
        columnNames: ['customer_id', 'idempotency_key'],
        isUnique: true,
        where: '"idempotency_key" IS NOT NULL',
      }),
    );

    await queryRunner.dropCheckConstraint(
      'sales_order',
      'CHK_sales_order_payment_status',
    );
    await queryRunner.dropCheckConstraint(
      'sales_order',
      'CHK_sales_order_payment_method',
    );
    await queryRunner.dropCheckConstraint(
      'sales_order',
      'CHK_sales_order_payment_confirmation',
    );
    await queryRunner.createCheckConstraint(
      'sales_order',
      new TableCheck({
        name: 'CHK_sales_order_payment_status',
        expression: `"payment_status" IN ('unpaid', 'paid')`,
      }),
    );
    await queryRunner.createCheckConstraint(
      'sales_order',
      new TableCheck({
        name: 'CHK_sales_order_payment_method',
        expression:
          '"payment_method" IS NULL OR "payment_method" IN (\'cod\', \'payos\')',
      }),
    );
    await queryRunner.createCheckConstraint(
      'sales_order',
      new TableCheck({
        name: 'CHK_sales_order_payment_confirmation',
        expression: `CASE WHEN "payment_status" = 'unpaid' THEN "payment_confirmed_at" IS NULL AND "payment_confirmed_by_employee_id" IS NULL WHEN "payment_status" = 'paid' AND "payment_method" IS NOT DISTINCT FROM 'cod' THEN "payment_confirmed_at" IS NOT NULL AND "payment_confirmed_by_employee_id" IS NOT NULL WHEN "payment_status" = 'paid' AND "payment_method" = 'payos' THEN "payment_confirmed_at" IS NOT NULL AND "payment_confirmed_by_employee_id" IS NULL ELSE FALSE END`,
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'payment_attempt',
        columns: [
          {
            name: 'payment_attempt_id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          { name: 'order_id', type: 'integer' },
          { name: 'provider', type: 'varchar', length: '20' },
          { name: 'provider_order_code', type: 'integer' },
          {
            name: 'provider_payment_link_id',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          { name: 'checkout_url', type: 'text', isNullable: true },
          { name: 'amount', type: 'numeric', precision: 24, scale: 2 },
          { name: 'status', type: 'varchar', length: '32' },
          { name: 'setup_lease_expires_at', type: 'timestamptz' },
          { name: 'expires_at', type: 'timestamptz' },
          { name: 'paid_at', type: 'timestamptz', isNullable: true },
          {
            name: 'provider_reference',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'observed_amount_paid',
            type: 'numeric',
            precision: 24,
            scale: 2,
            isNullable: true,
          },
          {
            name: 'reconciliation_reason',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'reconciliation_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'FK_payment_attempt_order',
            columnNames: ['order_id'],
            referencedTableName: 'sales_order',
            referencedColumnNames: ['order_id'],
            onDelete: 'RESTRICT',
          }),
        ],
        checks: [
          new TableCheck({
            name: 'CHK_payment_attempt_provider',
            expression: `"provider" IN ('payos')`,
          }),
          new TableCheck({
            name: 'CHK_payment_attempt_status',
            expression: `"status" IN ('creating', 'pending', 'paid', 'cancelled', 'expired', 'failed', 'reconciliation_required')`,
          }),
          new TableCheck({
            name: 'CHK_payment_attempt_provider_order_code_positive',
            expression: '"provider_order_code" > 0',
          }),
          new TableCheck({
            name: 'CHK_payment_attempt_amount_whole_vnd',
            expression:
              '"amount" > 0 AND "amount" = trunc("amount") AND "amount" <= 9007199254740991',
          }),
          new TableCheck({
            name: 'CHK_payment_attempt_observed_amount_paid_whole_vnd',
            expression:
              '"observed_amount_paid" IS NULL OR ("observed_amount_paid" >= 0 AND "observed_amount_paid" = trunc("observed_amount_paid"))',
          }),
        ],
      }),
    );
    await queryRunner.createIndex(
      'payment_attempt',
      new TableIndex({
        name: 'UQ_payment_attempt_order_id',
        columnNames: ['order_id'],
        isUnique: true,
      }),
    );
    await queryRunner.createIndex(
      'payment_attempt',
      new TableIndex({
        name: 'UQ_payment_attempt_provider_order_code',
        columnNames: ['provider_order_code'],
        isUnique: true,
      }),
    );
    await queryRunner.createIndex(
      'payment_attempt',
      new TableIndex({
        name: 'UQ_payment_attempt_provider_reference',
        columnNames: ['provider_reference'],
        isUnique: true,
        where: '"provider_reference" IS NOT NULL',
      }),
    );
    await queryRunner.createIndex(
      'payment_attempt',
      new TableIndex({
        name: 'IDX_payment_attempt_setup_lease_expiry',
        columnNames: ['setup_lease_expires_at'],
        where: `"status" = 'creating'`,
      }),
    );
    await queryRunner.createIndex(
      'payment_attempt',
      new TableIndex({
        name: 'IDX_payment_attempt_expiration',
        columnNames: ['expires_at'],
        where: `"status" = 'pending'`,
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (!queryRunner.isTransactionActive) {
      throw new Error(
        'Cannot remove PayOS payments without an active transaction.',
      );
    }

    await queryRunner.query(
      'LOCK TABLE "sales_order" IN ACCESS EXCLUSIVE MODE',
    );
    await queryRunner.query(
      'LOCK TABLE "payment_attempt" IN ACCESS EXCLUSIVE MODE',
    );

    const payosOrders: unknown = await queryRunner.query(
      `SELECT 1 FROM "sales_order" WHERE "payment_method" = 'payos' LIMIT 1`,
    );
    if (!Array.isArray(payosOrders)) {
      throw new Error(
        'Cannot verify whether PayOS orders exist; PayOS payment rollback was stopped.',
      );
    }
    if (payosOrders.length > 0) {
      throw new Error(
        'Cannot roll back PayOS payments while PayOS orders exist; online-payment history must be preserved.',
      );
    }

    const paymentAttempts: unknown = await queryRunner.query(
      'SELECT 1 FROM "payment_attempt" LIMIT 1',
    );
    if (!Array.isArray(paymentAttempts)) {
      throw new Error(
        'Cannot verify whether payment attempts exist; PayOS payment rollback was stopped.',
      );
    }
    if (paymentAttempts.length > 0) {
      throw new Error(
        'Cannot roll back PayOS payments while payment attempts exist; online-payment history must be preserved.',
      );
    }

    await queryRunner.dropTable('payment_attempt');
    await queryRunner.dropCheckConstraint(
      'sales_order',
      'CHK_sales_order_idempotency',
    );
    await queryRunner.dropIndex(
      'sales_order',
      'UQ_sales_order_customer_idempotency_key',
    );
    await queryRunner.dropColumns('sales_order', [
      'idempotency_key',
      'request_fingerprint',
    ]);

    await queryRunner.dropCheckConstraint(
      'sales_order',
      'CHK_sales_order_payment_status',
    );
    await queryRunner.dropCheckConstraint(
      'sales_order',
      'CHK_sales_order_payment_method',
    );
    await queryRunner.dropCheckConstraint(
      'sales_order',
      'CHK_sales_order_payment_confirmation',
    );
    await queryRunner.createCheckConstraint(
      'sales_order',
      new TableCheck({
        name: 'CHK_sales_order_payment_status',
        expression: `"payment_status" IN ('unpaid', 'paid')`,
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
}
