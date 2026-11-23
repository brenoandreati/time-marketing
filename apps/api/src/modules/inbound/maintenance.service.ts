import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, lt, sql } from 'drizzle-orm';
import type { Database } from '../../database/client';
import { DB } from '../../database/database.module';
import { webhookEvents } from '../../database/schema';
import { ChannelAccountsService } from '../channels/channel-accounts.service';
import { QueueService } from '../queue/queue.module';

/** Rotinas periódicas executadas pelo worker. */
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(@Inject(DB) private readonly db: Database, private readonly accounts: ChannelAccountsService, private readonly queues: QueueService) {}

  /** Renova tokens que vencem em breve e marca os já vencidos. */
  async refreshTokens() {
    const due = await this.accounts.accountsNeedingRefresh(10);
    let ok = 0;
    for (const acc of due) if (await this.accounts.refreshToken(acc)) ok++;
    const expired = await this.accounts.expireOverdueTokens();
    if (due.length || expired) this.logger.log(`Tokens: ${ok}/${due.length} renovados, ${expired} marcados como expirados`);
    return { due: due.length, refreshed: ok, expired };
  }

  /**
   * Reenfileira eventos que ficaram parados (Redis indisponível no recebimento, worker reiniciado
   * no meio do processamento). O jobId fixo impede duplicar jobs ainda na fila.
   */
  async requeueStaleEvents() {
    const cutoff = new Date(Date.now() - 2 * 60_000);
    // Eventos presos em "processing" (worker caiu) voltam para "received".
    await this.db
      .update(webhookEvents)
      .set({ status: 'received' })
      .where(and(eq(webhookEvents.status, 'processing'), lt(webhookEvents.receivedAt, new Date(Date.now() - 10 * 60_000))));
    const stale = await this.db
      .select({ id: webhookEvents.id })
      .from(webhookEvents)
      .where(and(eq(webhookEvents.status, 'received'), lt(webhookEvents.receivedAt, cutoff), sql`${webhookEvents.attempts} < 6`))
      .limit(500);
    for (const e of stale) {
      const job = await this.queues.webhookEvents.getJob(`evt-${e.id}`);
      if (job) {
        const state = await job.getState();
        if (state === 'failed' || state === 'completed') await job.remove();
        else continue;
      }
      await this.queues.enqueueWebhookEvent(e.id);
    }
    return stale.length;
  }
}
