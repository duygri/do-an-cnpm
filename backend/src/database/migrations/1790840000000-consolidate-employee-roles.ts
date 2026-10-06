import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConsolidateEmployeeRoles1790840000000 implements MigrationInterface {
  name = 'ConsolidateEmployeeRoles1790840000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "employee" DROP CONSTRAINT "CHK_employee_role"',
    );
    await queryRunner.query(`
      UPDATE "employee"
      SET "status" = 'inactive'
      WHERE "role" = 'unassigned' AND "status" = 'active'
    `);
    await queryRunner.query(`
      UPDATE "employee"
      SET "role" = CASE WHEN "role" = 'admin' THEN 'admin' ELSE 'manager' END
    `);
    await queryRunner.query(
      `ALTER TABLE "employee" ALTER COLUMN "role" SET DEFAULT 'manager'`,
    );
    await queryRunner.query(`
      ALTER TABLE "employee"
      ADD CONSTRAINT "CHK_employee_role"
      CHECK ("role" IN ('admin', 'manager'))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "employee" DROP CONSTRAINT "CHK_employee_role"',
    );
    await queryRunner.query(`
      UPDATE "employee"
      SET "role" = CASE WHEN "role" = 'admin' THEN 'admin' ELSE 'unassigned' END
    `);
    await queryRunner.query(
      `ALTER TABLE "employee" ALTER COLUMN "role" SET DEFAULT 'unassigned'`,
    );
    await queryRunner.query(`
      ALTER TABLE "employee"
      ADD CONSTRAINT "CHK_employee_role"
      CHECK ("role" IN (
        'admin',
        'catalog_manager',
        'promotion_manager',
        'order_staff',
        'purchasing_staff',
        'unassigned'
      ))
    `);
  }
}
