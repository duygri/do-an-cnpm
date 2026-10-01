import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddOrderDetailSnapshots1790840000000 implements MigrationInterface {
  name = 'AddOrderDetailSnapshots1790840000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!queryRunner.isTransactionActive) {
      throw new Error(
        'Cannot add order detail snapshots without an active transaction.',
      );
    }

    await queryRunner.addColumns('order_detail', [
      new TableColumn({
        name: 'product_name_snapshot',
        type: 'varchar',
        length: '200',
        isNullable: true,
      }),
      new TableColumn({
        name: 'variant_size_snapshot',
        type: 'varchar',
        length: '50',
        isNullable: true,
      }),
      new TableColumn({
        name: 'variant_color_snapshot',
        type: 'varchar',
        length: '50',
        isNullable: true,
      }),
    ]);

    await queryRunner.query(`
      UPDATE "order_detail" AS detail
      SET "product_name_snapshot" = product."name",
          "variant_size_snapshot" = variant."size",
          "variant_color_snapshot" = variant."color"
      FROM "product_variant" AS variant
      INNER JOIN "product" AS product
        ON product."product_id" = variant."product_id"
      WHERE variant."variant_id" = detail."variant_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "order_detail"
      ALTER COLUMN "product_name_snapshot" SET NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (!queryRunner.isTransactionActive) {
      throw new Error(
        'Cannot remove order detail snapshots without an active transaction.',
      );
    }

    await queryRunner.dropColumn('order_detail', 'variant_color_snapshot');
    await queryRunner.dropColumn('order_detail', 'variant_size_snapshot');
    await queryRunner.dropColumn('order_detail', 'product_name_snapshot');
  }
}
