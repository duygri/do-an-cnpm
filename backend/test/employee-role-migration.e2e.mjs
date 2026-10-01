import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL must point to a dedicated *_test database.',
  );
}

let databaseName;
try {
  databaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.slice(1));
} catch {
  throw new Error(
    'TEST_DATABASE_URL must be a valid PostgreSQL connection URL.',
  );
}
if (!databaseName.toLowerCase().endsWith('_test')) {
  throw new Error(
    'Refusing to run against a database whose name does not end in _test.',
  );
}

const backendDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const require = createRequire(import.meta.url);
const { Client } = require('pg');
const { DataSource } = require('typeorm');
const schemaName = `employee_role_migration_${randomUUID().replaceAll('-', '')}`;
const quotedSchemaName = `"${schemaName}"`;

let client;
let dataSource;
let queryRunner;
let migration;

before(async () => {
  client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  await client.query(`CREATE SCHEMA ${quotedSchemaName}`);
  await client.query(`
    CREATE TABLE ${quotedSchemaName}.employee (
      employee_id integer PRIMARY KEY,
      name varchar(120) NOT NULL,
      email varchar(254) NOT NULL,
      phone varchar(30),
      password_hash varchar(255) NOT NULL,
      position varchar(80) NOT NULL,
      status varchar(30) NOT NULL DEFAULT 'active'
    )
  `);
  await client.query(
    `INSERT INTO ${quotedSchemaName}.employee
       (employee_id, name, email, password_hash, position, status)
     VALUES
       (1, 'Legacy Admin', 'legacy-admin@example.com', 'hash', ' Admin ', 'active'),
       (2, 'Legacy Employee', 'legacy-employee@example.com', 'hash', 'Sales', 'active')`,
  );

  dataSource = new DataSource({
    type: 'postgres',
    url: testDatabaseUrl,
    schema: schemaName,
    entities: [],
    migrations: [],
    synchronize: false,
  });
  await dataSource.initialize();
  queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.query(`SET search_path TO ${quotedSchemaName}`);

  const migrationPath = path.join(
    backendDirectory,
    'dist',
    'database',
    'migrations',
    '1790830000000-add-employee-role.js',
  );
  const { AddEmployeeRole1790830000000 } = require(migrationPath);
  migration = new AddEmployeeRole1790830000000();
});

after(async () => {
  try {
    if (queryRunner) await queryRunner.release();
  } finally {
    try {
      if (dataSource?.isInitialized) await dataSource.destroy();
    } finally {
      if (client) {
        try {
          await client.query(
            `DROP SCHEMA IF EXISTS ${quotedSchemaName} CASCADE`,
          );
        } finally {
          await client.end();
        }
      }
    }
  }
});

test('employee role migration backfills existing employees and rejects unknown roles', async () => {
  await queryRunner.startTransaction();
  try {
    await migration.up(queryRunner);
    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  }

  const employees = await queryRunner.query(
    'SELECT employee_id, role FROM employee ORDER BY employee_id',
  );
  assert.deepEqual(employees, [
    { employee_id: 1, role: 'admin' },
    { employee_id: 2, role: 'unassigned' },
  ]);

  await queryRunner.query(
    `INSERT INTO employee (employee_id, name, email, password_hash, position)
     VALUES (3, 'New Employee', 'new-employee@example.com', 'hash', 'Sales')`,
  );
  const [newEmployee] = await queryRunner.query(
    'SELECT role FROM employee WHERE employee_id = 3',
  );
  assert.equal(newEmployee.role, 'unassigned');

  await assert.rejects(
    queryRunner.query(
      `UPDATE employee SET role = 'warehouse_admin' WHERE employee_id = 2`,
    ),
    (error) => error?.code === '23514',
  );

  await queryRunner.startTransaction();
  try {
    await migration.down(queryRunner);
    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  }
  const roleColumn = await queryRunner.query(
    `
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = 'employee' AND column_name = 'role'
  `,
    [schemaName],
  );
  assert.deepEqual(roleColumn, []);
});
