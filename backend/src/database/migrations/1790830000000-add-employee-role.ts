import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmployeeRole1790830000000 implements MigrationInterface {
  name = 'AddEmployeeRole1790830000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employee"
      ADD COLUMN "role" varchar(30) NOT NULL DEFAULT 'unassigned'
    `);
    await queryRunner.query(`
      UPDATE "employee"
      SET "role" = CASE
        WHEN LOWER(BTRIM("position")) = 'admin' THEN 'admin'
        ELSE 'unassigned'
      END
    `);
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
    await queryRunner.query(
      'CREATE INDEX "IDX_employee_role_status" ON "employee" ("role", "status")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "IDX_employee_role_status"');
    await queryRunner.query(
      'ALTER TABLE "employee" DROP CONSTRAINT "CHK_employee_role"',
    );
    await queryRunner.query('ALTER TABLE "employee" DROP COLUMN "role"');
  }
}
