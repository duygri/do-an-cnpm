import 'dotenv/config';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required. Point it at a dedicated PostgreSQL database whose name ends in _test.',
  );
}

let databaseName: string;
try {
  databaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.slice(1));
} catch {
  throw new Error('TEST_DATABASE_URL must be a valid PostgreSQL connection URL.');
}

if (!databaseName.toLowerCase().endsWith('_test')) {
  throw new Error(
    'Refusing to reset database: TEST_DATABASE_URL database name must end in _test.',
  );
}

process.env.DATABASE_URL = testDatabaseUrl;

async function prepareTestDatabase(): Promise<void> {
  const loadedDataSource = require('../src/database/data-source') as {
    default: import('typeorm').DataSource;
  };
  const dataSource = loadedDataSource.default;
  await dataSource.initialize();

  try {
    await dataSource.dropDatabase();
    await dataSource.runMigrations({ transaction: 'all' });
    console.log(`Prepared isolated test database: ${databaseName}`);
  } finally {
    await dataSource.destroy();
  }
}

void prepareTestDatabase().catch((error: unknown) => {
  console.error('Could not prepare the dedicated test database.');
  console.error(error instanceof Error ? error.message : 'Unknown database error.');
  process.exitCode = 1;
});
