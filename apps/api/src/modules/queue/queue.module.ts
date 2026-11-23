import { Global, Inject, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { JOB_PROCESS_WEBHOOK_EVENT, ProcessWebhookEventJob, QUEUE_MAINTENANCE, QUEUE_WEBHOOK_EVENTS } from './queue.constants';

export const REDIS = Symbol('REDIS');

export function createRedis(url: string) {
  // maxRetriesPerRequest: null é exigido pelo BullMQ para workers.
  return new IORedis(url, { maxRetriesPerRequest: null, enableReadyCheck: true, lazyConnect: false });
}

/** Produtor das filas. API e worker compartilham esta definição; só o worker consome. */
@Injectable()
export class QueueService implements OnApplicationShutdown {
  readonly webhookEvents: Queue;
  readonly maintenance: Queue;

  constructor(@Inject(REDIS) connection: IORedis) {
    this.webhookEvents = new Queue(QUEUE_WEBHOOK_EVENTS, {
      connection,
      defaultJobOptions: {
        attempts: 6,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 24 * 3600, count: 5000 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    });
    this.maintenance = new Queue(QUEUE_MAINTENANCE, { connection, defaultJobOptions: { removeOnComplete: 100, removeOnFail: 500 } });
  }

  /** jobId = id do evento: o BullMQ ignora o mesmo evento enfileirado duas vezes. */
  enqueueWebhookEvent(eventId: string) {
    const data: ProcessWebhookEventJob = { eventId };
    return this.webhookEvents.add(JOB_PROCESS_WEBHOOK_EVENT, data, { jobId: `evt-${eventId}` });
  }

  async onApplicationShutdown() {
    await Promise.allSettled([this.webhookEvents.close(), this.maintenance.close()]);
  }
}

@Global()
@Module({
  providers: [
    { provide: REDIS, inject: [ENV], useFactory: (env: Env) => createRedis(env.REDIS_URL) },
    QueueService,
  ],
  exports: [REDIS, QueueService],
})
export class QueueModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: IORedis) {}
  async onApplicationShutdown() {
    await this.redis.quit().catch(() => undefined);
  }
}
