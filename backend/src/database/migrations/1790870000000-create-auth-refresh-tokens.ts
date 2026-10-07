import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuthRefreshTokens1790870000000 implements MigrationInterface {
  name = 'CreateAuthRefreshTokens1790870000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "auth_refresh_token" (
        "id" uuid PRIMARY KEY,
        "family_id" uuid NOT NULL,
        "customer_id" integer NULL,
        "employee_id" integer NULL,
        "token_hash" varchar(64) NOT NULL,
        "created_at" timestamptz NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "consumed_at" timestamptz NULL,
        "revoked_at" timestamptz NULL,
        "replaced_by_token_id" uuid NULL,
        CONSTRAINT "CHK_auth_refresh_token_single_owner"
          CHECK (("customer_id" IS NOT NULL) <> ("employee_id" IS NOT NULL)),
        CONSTRAINT "FK_auth_refresh_token_customer"
          FOREIGN KEY ("customer_id") REFERENCES "customer"("customer_id") ON DELETE CASCADE,
        CONSTRAINT "FK_auth_refresh_token_employee"
          FOREIGN KEY ("employee_id") REFERENCES "employee"("employee_id") ON DELETE CASCADE,
        CONSTRAINT "FK_auth_refresh_token_replacement"
          FOREIGN KEY ("replaced_by_token_id") REFERENCES "auth_refresh_token"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_auth_refresh_token_hash" ON "auth_refresh_token" ("token_hash")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_auth_refresh_token_family" ON "auth_refresh_token" ("family_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_auth_refresh_token_expiry" ON "auth_refresh_token" ("expires_at")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "auth_refresh_token"');
  }
}
