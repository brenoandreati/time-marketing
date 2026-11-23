import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type IORedis from 'ioredis';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/database.module';
import { Public } from '../auth/decorators';
import { REDIS } from '../queue/queue.module';

@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool, @Inject(REDIS) private readonly redis: IORedis) {}

  @Get()
  async check() {
    const [db, redis] = await Promise.allSettled([this.pool.query('select 1'), this.redis.ping()]);
    const status = { database: db.status === 'fulfilled', redis: redis.status === 'fulfilled' };
    if (!status.database || !status.redis) throw new ServiceUnavailableException({ code: 'unhealthy', message: 'Dependência indisponível', ...status });
    return { ok: true, ...status };
  }
}
