import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { ENV } from './config/config.module';
import type { Env } from './config/env';
import { InboundProcessorService } from './modules/inbound/inbound-processor.service';
import { MaintenanceService } from './modules/inbound/maintenance.service';
import { createRedis } from './modules/queue/queue.module';
import { QueueService } from './modules/queue/queue.module';
import {
  JOB_REFRESH_TOKENS,
  JOB_REQUEUE_STALE_EVENTS,
  ProcessWebhookEventJob,
  QUEUE_MAINTENANCE,
  QUEUE_WEBHOOK_EVENTS,
} from './modules/queue/queue.constants';

/** Consumidores das filas. Cada worker usa conexão Redis própria (exigência do BullMQ). */
@Injectable()
export class WorkerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Worker');
  private workers: Worker[] = [];

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly inbound: InboundProcessorService,
    private readonly maintenance: MaintenanceService,
    private readonly queues: QueueService,
  ) {}

  async onApplicationBootstrap() {
    const webhookWorker = new Worker<ProcessWebhookEventJob>(
      QUEUE_WEBHOOK_EVENTS,
      async (job: Job<ProcessWebhookEventJob>) => {
        const maxAttempts = job.opts.attempts ?? 1;
        return this.inbound.process(job.data.eventId, job.attemptsMade + 1, maxAttempts);
      },
      // Concorrência alta e isolamento por evento: a falha de uma empresa não trava as demais.
      { connection: createRedis(this.env.REDIS_URL), concurrency: 20 },
    );
    webhookWorker.on('failed', (job, err) => this.logger.warn(`Evento ${job?.data.eventId} falhou (tentativa ${job?.attemptsMade}): ${err.message}`));

    const maintenanceWorker = new Worker(
      QUEUE_MAINTENANCE,
      async (job) => {
        if (job.name === JOB_REFRESH_TOKENS) return this.maintenance.refreshTokens();
        if (job.name === JOB_REQUEUE_STALE_EVENTS) return this.maintenance.requeueStaleEvents();
      },
      { connection: createRedis(this.env.REDIS_URL), concurrency: 1 },
    );
    maintenanceWorker.on('failed', (job, err) => this.logger.error(`Rotina ${job?.name} falhou: ${err.message}`));

    this.workers = [webhookWorker, maintenanceWorker];

    await this.queues.maintenance.upsertJobScheduler('refresh-tokens-every-6h', { every: 6 * 3600_000 }, { name: JOB_REFRESH_TOKENS });
    await this.queues.maintenance.upsertJobScheduler('requeue-stale-events-every-min', { every: 60_000 }, { name: JOB_REQUEUE_STALE_EVENTS });
    this.logger.log('Worker iniciado: filas webhook-events e maintenance');
  }

  async onApplicationShutdown() {
    await Promise.allSettled(this.workers.map((w) => w.close()));
  }
}
