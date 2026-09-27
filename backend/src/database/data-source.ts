import 'dotenv/config';
import { DataSource } from 'typeorm';
import { join } from 'node:path';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is required. Copy .env.example to .env and configure PostgreSQL.',
  );
}

export default new DataSource({
  type: 'postgres',
  url: databaseUrl,
  entities: [join(__dirname, '..', '**', '*.entity{.ts,.js}')],
  migrations: [join(__dirname, 'migrations', '*{.ts,.js}')],
  synchronize: false,
  migrationsRun: false,
});
