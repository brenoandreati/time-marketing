import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Database } from '../../database/client';
import { DB } from '../../database/database.module';
import { channelAccounts, webhookEvents } from '../../database/schema';
import { QueueService } from '../queue/queue.module';
import type { NormalizedWebhookItem } from './instagram-webhook.parser';

export type IngestResult = { received: number; inserted: number; duplicates: number; unrouted: number };

/**
 * Persiste os itens recebidos (com deduplicação no banco) e enfileira o processamento.
 * Se o Redis estiver fora, o evento continua salvo como `received` e é reenfileirado pela rotina de manutenção.
 */
@Injectable()
export class WebhookIngestService {
  private readonly logger = new Logger(WebhookIngestService.name);

  constructor(@Inject(DB) private readonly db: Database, private readonly queues: QueueService) {}

  async ingestInstagram(items: NormalizedWebhookItem[]): Promise<IngestResult> {
    if (!items.length) return { received: 0, inserted: 0, duplicates: 0, unrouted: 0 };

    const recipientIds = [...new Set(items.map((i) => i.recipientExternalId))];
    const accounts = await this.db
      .select({ id: channelAccounts.id, workspaceId: channelAccounts.workspaceId, externalId: channelAccounts.externalId })
      .from(channelAccounts)
      .where(and(eq(channelAccounts.channel, 'instagram'), inArray(channelAccounts.externalId, recipientIds), isNull(channelAccounts.disconnectedAt)));
    const byExternal = new Map(accounts.map((a) => [a.externalId, a]));

    const rows = items.map((i) => {
      const acc = byExternal.get(i.recipientExternalId);
      return {
        channel: 'instagram' as const,
        dedupeKey: i.dedupeKey,
        eventType: i.eventType,
        recipientExternalId: i.recipientExternalId,
        workspaceId: acc?.workspaceId ?? null,
        channelAccountId: acc?.id ?? null,
        payload: i.payload,
        occurredAt: i.occurredAt,
        // Evento para conta que não está conectada: guardado para auditoria, mas não processado.
        status: acc ? ('received' as const) : ('ignored' as const),
        error: acc ? null : 'Conta de destino não está conectada a nenhuma empresa.',
      };
    });

    const inserted = await this.db
      .insert(webhookEvents)
      .values(rows)
      .onConflictDoNothing({ target: [webhookEvents.channel, webhookEvents.dedupeKey] })
      .returning({ id: webhookEvents.id, status: webhookEvents.status });

    const toQueue = inserted.filter((r) => r.status === 'received');
    for (const r of toQueue) {
      try {
        await this.queues.enqueueWebhookEvent(r.id);
      } catch (err) {
        this.logger.error(`Falha ao enfileirar evento ${r.id}; será reprocessado pela manutenção: ${(err as Error).message}`);
      }
    }

    return {
      received: items.length,
      inserted: inserted.length,
      duplicates: items.length - inserted.length,
      unrouted: inserted.filter((r) => r.status === 'ignored').length,
    };
  }
}
