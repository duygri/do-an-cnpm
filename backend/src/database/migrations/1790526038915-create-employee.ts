import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateEmployee1790526038915 implements MigrationInterface {
  name = 'CreateEmployee1790526038915';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'employee',
        columns: [
          {
            name: 'employee_id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          { name: 'name', type: 'varchar', length: '120' },
          { name: 'email', type: 'varchar', length: '254' },
          { name: 'phone', type: 'varchar', length: '30', isNullable: true },
          { name: 'password_hash', type: 'varchar', length: '255' },
          { name: 'position', type: 'varchar', length: '80' },
          {
            name: 'status',
            type: 'varchar',
            length: '30',
            default: "'active'",
          },
        ],
      }),
    );

    await queryRunner.createIndex(
      'employee',
      new TableIndex({
        name: 'UQ_employee_email',
        columnNames: ['email'],
        isUnique: true,
      }),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('employee');
  }
}
