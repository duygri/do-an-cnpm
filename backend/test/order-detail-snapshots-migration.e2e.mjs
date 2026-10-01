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
const migrationPath = path.join(
  backendDirectory,
  'dist',
  'database',
  'migrations',
  '1790840000000-add-order-detail-snapshots.js',
);
const { AddOrderDetailSnapshots1790840000000 } = require(migrationPath);
const schemaName = `order_detail_snapshots_${randomUUID().replaceAll('-', '')}`;
const quotedSchemaName = `"${schemaName}"`;

let client;
let dataSource;
let queryRunner;
const migration = new AddOrderDetailSnapshots1790840000000();

before(async () => {
  client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();
  await client.query(`CREATE SCHEMA ${quotedSchemaName}`);
  await client.query(`
    CREATE TABLE ${quotedSchemaName}.product (
      product_id integer PRIMARY KEY,
      name varchar(200) NOT NULL
    )
  `);
  await client.query(`
    CREATE TABLE ${quotedSchemaName}.product_variant (
      variant_id integer PRIMARY KEY,
      size varchar(50),
      color varchar(50),
      product_id integer NOT NULL,
      CONSTRAINT FK_product_variant_product
        FOREIGN KEY (product_id) REFERENCES ${quotedSchemaName}.product(product_id)
        ON DELETE RESTRICT
    )
  `);
  await client.query(`
    CREATE TABLE ${quotedSchemaName}.sales_order (
      order_id integer PRIMARY KEY
    )
  `);
  await client.query(`
    CREATE TABLE ${quotedSchemaName}.order_detail (
      order_id integer NOT NULL,
      variant_id integer NOT NULL,
      quantity integer NOT NULL,
      unit_price numeric(12, 2) NOT NULL,
      subtotal numeric(22, 2) NOT NULL,
      CONSTRAINT PK_order_detail PRIMARY KEY (order_id, variant_id),
      CONSTRAINT FK_order_detail_order
        FOREIGN KEY (order_id) REFERENCES ${quotedSchemaName}.sales_order(order_id)
        ON DELETE RESTRICT,
      CONSTRAINT FK_order_detail_variant
        FOREIGN KEY (variant_id) REFERENCES ${quotedSchemaName}.product_variant(variant_id)
        ON DELETE RESTRICT
    )
  `);
  await client.query(`
    INSERT INTO ${quotedSchemaName}.product (product_id, name)
    VALUES (10, 'Linen Shirt'), (20, 'Cotton T-Shirt')
  `);
  await client.query(`
    INSERT INTO ${quotedSchemaName}.product_variant
      (variant_id, size, color, product_id)
    VALUES (101, 'M', 'Navy', 10), (202, NULL, NULL, 20)
  `);
  await client.query(`
    INSERT INTO ${quotedSchemaName}.sales_order (order_id)
    VALUES (1001), (1002)
  `);
  await client.query(`
    INSERT INTO ${quotedSchemaName}.order_detail
      (order_id, variant_id, quantity, unit_price, subtotal)
    VALUES (1001, 101, 2, 25.50, 51.00), (1002, 202, 1, 12.00, 12.00)
  `);

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

test('order detail snapshot migration backfills, constrains and safely rolls back', async () => {
  await assert.rejects(migration.up(queryRunner), /active transaction/i);
  const columnsBeforeUp = await queryRunner.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = $1
      AND table_name = 'order_detail'
      AND column_name IN (
        'product_name_snapshot',
        'variant_size_snapshot',
        'variant_color_snapshot'
      )
    ORDER BY column_name
  `,
    [schemaName],
  );
  assert.deepEqual(columnsBeforeUp, []);

  await queryRunner.startTransaction();
  try {
    await migration.up(queryRunner);
    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  }

  const details = await queryRunner.query(`
    SELECT order_id, variant_id, product_name_snapshot,
           variant_size_snapshot, variant_color_snapshot
    FROM order_detail
    ORDER BY order_id
  `);
  assert.deepEqual(details, [
    {
      order_id: 1001,
      variant_id: 101,
      product_name_snapshot: 'Linen Shirt',
      variant_size_snapshot: 'M',
      variant_color_snapshot: 'Navy',
    },
    {
      order_id: 1002,
      variant_id: 202,
      product_name_snapshot: 'Cotton T-Shirt',
      variant_size_snapshot: null,
      variant_color_snapshot: null,
    },
  ]);

  const snapshotColumns = await queryRunner.query(
    `
    SELECT column_name, is_nullable, character_maximum_length
    FROM information_schema.columns
    WHERE table_schema = $1
      AND table_name = 'order_detail'
      AND column_name IN (
        'product_name_snapshot',
        'variant_size_snapshot',
        'variant_color_snapshot'
      )
    ORDER BY column_name
  `,
    [schemaName],
  );
  assert.deepEqual(snapshotColumns, [
    {
      column_name: 'product_name_snapshot',
      is_nullable: 'NO',
      character_maximum_length: 200,
    },
    {
      column_name: 'variant_color_snapshot',
      is_nullable: 'YES',
      character_maximum_length: 50,
    },
    {
      column_name: 'variant_size_snapshot',
      is_nullable: 'YES',
      character_maximum_length: 50,
    },
  ]);

  await assert.rejects(migration.down(queryRunner), /active transaction/i);
  const columnsAfterRejectedDown = await queryRunner.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = $1
      AND table_name = 'order_detail'
      AND column_name IN (
        'product_name_snapshot',
        'variant_size_snapshot',
        'variant_color_snapshot'
      )
    ORDER BY column_name
  `,
    [schemaName],
  );
  assert.equal(columnsAfterRejectedDown.length, 3);

  await queryRunner.startTransaction();
  try {
    await migration.down(queryRunner);
    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  }

  const columnsAfterDown = await queryRunner.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = $1
      AND table_name = 'order_detail'
      AND column_name IN (
        'product_name_snapshot',
        'variant_size_snapshot',
        'variant_color_snapshot'
      )
  `,
    [schemaName],
  );
  assert.deepEqual(columnsAfterDown, []);

  const originalRows = await queryRunner.query(`
    SELECT order_id, variant_id, quantity, unit_price, subtotal
    FROM order_detail
    ORDER BY order_id
  `);
  assert.deepEqual(originalRows, [
    {
      order_id: 1001,
      variant_id: 101,
      quantity: 2,
      unit_price: '25.50',
      subtotal: '51.00',
    },
    {
      order_id: 1002,
      variant_id: 202,
      quantity: 1,
      unit_price: '12.00',
      subtotal: '12.00',
    },
  ]);
});
