import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

export function createPool(url: string) {
  return new Pool({ connectionString: url, max: 10 });
}

export function createDatabase(pool: Pool): Database {
  return drizzle(pool, { schema, casing: 'snake_case' });
}
