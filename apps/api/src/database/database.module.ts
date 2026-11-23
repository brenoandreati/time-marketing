import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { createDatabase, createPool } from './client';

export const PG_POOL = Symbol('PG_POOL');
export const DB = Symbol('DB');

@Global()
@Module({
  providers: [
    { provide: PG_POOL, inject: [ENV], useFactory: (env: Env) => createPool(env.DATABASE_URL) },
    { provide: DB, inject: [PG_POOL], useFactory: (pool: Pool) => createDatabase(pool) },
  ],
  exports: [DB, PG_POOL],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}
  async onApplicationShutdown() {
    await this.pool.end();
  }
}
