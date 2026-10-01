import {
  MigrationInterface,
  QueryRunner,
  TableCheck,
  TableColumn,
  TableIndex,
} from 'typeorm';

export class AddEmployeeRole1790830000000 implements MigrationInterface {
  name = 'AddEmployeeRole1790830000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!queryRunner.isTransactionActive) {
      throw new Error(
        'Cannot add employee roles without an active transaction.',
      );
    }

    await queryRunner.addColumn(
      'employee',
      new TableColumn({
        name: 'role',
        type: 'varchar',
        length: '30',
        default: "'unassigned'",
        isNullable: false,
      }),
    );

    await queryRunner.query(`
      UPDATE "employee"
      SET "role" = CASE
        WHEN LOWER(BTRIM("position")) = 'admin' THEN 'admin'
        ELSE 'unassigned'
      END
    `);

    await queryRunner.createCheckConstraint(
      'employee',
      new TableCheck({
        name: 'CHK_employee_role',
        expression:
          "\"role\" IN ('admin', 'catalog_manager', 'promotion_manager', 'order_staff', 'purchasing_staff', 'unassigned')",
      }),
    );
    await queryRunner.createIndex(
      'employee',
      new TableIndex({
        name: 'IDX_employee_role_status',
        columnNames: ['role', 'status'],
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (!queryRunner.isTransactionActive) {
      throw new Error(
        'Cannot remove employee roles without an active transaction.',
      );
    }

    await queryRunner.dropIndex('employee', 'IDX_employee_role_status');
    await queryRunner.dropCheckConstraint('employee', 'CHK_employee_role');
    await queryRunner.dropColumn('employee', 'role');
  }
}
