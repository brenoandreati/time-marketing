import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadDotenv } from '../config/load-dotenv';
import { createDatabase, createPool } from './client';
import { seedPlans } from './seed-plans';

export async function runMigrations(url: string) {
  const pool = createPool(url);
  try {
    const db = createDatabase(pool);
    await migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') });
    await seedPlans(db);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  loadDotenv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida');
  runMigrations(url)
    .then(() => console.log('Migrações aplicadas.'))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
