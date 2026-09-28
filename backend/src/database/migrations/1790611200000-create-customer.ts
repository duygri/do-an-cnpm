import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateCustomer1790611200000 implements MigrationInterface {
  name = 'CreateCustomer1790611200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'customer',
        columns: [
          {
            name: 'customer_id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          { name: 'name', type: 'varchar', length: '120' },
          { name: 'email', type: 'varchar', length: '254' },
          {
            name: 'date_of_birth',
            type: 'date',
            isNullable: true,
          },
          { name: 'phone', type: 'varchar', length: '30', isNullable: true },
          { name: 'gender', type: 'varchar', length: '30', isNullable: true },
          { name: 'address', type: 'text', isNullable: true },
          { name: 'password_hash', type: 'varchar', length: '255' },
        ],
      }),
    );

    await queryRunner.createIndex(
      'customer',
      new TableIndex({
        name: 'UQ_customer_email',
        columnNames: ['email'],
        isUnique: true,
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('customer');
  }
}
