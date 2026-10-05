import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductImageHttpsCheck1790860000000 implements MigrationInterface {
  name = 'AddProductImageHttpsCheck1790860000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_image"
      ADD CONSTRAINT "CHK_product_image_https"
      CHECK ("image_url" ~* '^https://')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "product_image" DROP CONSTRAINT "CHK_product_image_https"',
    );
  }
}
