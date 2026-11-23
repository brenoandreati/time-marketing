import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '../../database/client';
import { DB } from '../../database/database.module';
import { channelAccounts, contacts, conversations, messages, webhookEvents } from '../../database/schema';
import { ActivityService } from '../activity/activity.service';
import { ChannelAccountsService } from '../channels/channel-accounts.service';
import { InstagramGraphClient, MetaApiError } from '../instagram/instagram-graph.client';
import { mapInstagramMessage, previewOf } from './message-mapper';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type Account = typeof channelAccounts.$inferSelect;
type Outcome = { status: 'processed' | 'ignored'; note?: string };

/**
 * Processa um evento de webhook já persistido. Idempotente: pode ser chamado várias vezes
 * para o mesmo evento (retentativas, reenfileiramento) sem duplicar contatos ou mensagens.
 */
@Injectable()
export class InboundProcessorService {
  private readonly logger = new Logger(InboundProcessorService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly activity: ActivityService,
    private readonly accounts: ChannelAccountsService,
    private readonly graph: InstagramGraphClient,
  ) {}

  async process(eventId: string, attempt: number, maxAttempts: number): Promise<Outcome | 'skipped'> {
    // Reivindica o evento: só um worker processa por vez e eventos já concluídos são pulados.
    const [event] = await this.db
      .update(webhookEvents)
      .set({ status: 'processing', attempts: sql`${webhookEvents.attempts} + 1` })
      .where(and(eq(webhookEvents.id, eventId), sql`${webhookEvents.status} in ('received', 'failed')`))
      .returning();
    if (!event) return 'skipped';

    try {
      const outcome = await this.dispatch(event);
      await this.db
        .update(webhookEvents)
        .set({ status: outcome.status, error: outcome.note ?? null, processedAt: new Date() })
        .where(eq(webhookEvents.id, event.id));
      return outcome;
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      const final = attempt >= maxAttempts;
      await this.db
        .update(webhookEvents)
        .set({ status: final ? 'failed' : 'received', error: message.slice(0, 1000) })
        .where(eq(webhookEvents.id, event.id));
      if (final && event.workspaceId) {
        await this.activity.record({
          workspaceId: event.workspaceId,
          type: 'webhook.failed',
          level: 'error',
          entityType: 'webhook_event',
          entityId: event.id,
          message: `Falha ao processar evento ${event.eventType} do Instagram: ${message.slice(0, 200)}`,
        });
      }
      throw err;
    }
  }

  private async dispatch(event: typeof webhookEvents.$inferSelect): Promise<Outcome> {
    if (!event.channelAccountId || !event.workspaceId) return { status: 'ignored', note: 'Evento sem conta conectada.' };
    const [account] = await this.db
      .select()
      .from(channelAccounts)
      .where(and(eq(channelAccounts.id, event.channelAccountId), isNull(channelAccounts.disconnectedAt)));
    if (!account) return { status: 'ignored', note: 'Conta desconectada antes do processamento.' };

    const p = event.payload as any;
    switch (event.eventType) {
      case 'message':
        return this.handleInboundMessage(account, p, event.occurredAt ?? event.receivedAt);
      case 'message_echo':
        return this.handleEcho(account, p, event.occurredAt ?? event.receivedAt);
      case 'comment':
        return this.handleComment(account, p);
      default:
        // Reações, leituras, postbacks etc. ficam registrados em webhook_events e passam a ter efeito na Fase 2.
        return { status: 'ignored', note: `Tipo ${event.eventType} armazenado; sem ação configurada.` };
    }
  }

  private async handleInboundMessage(account: Account, m: any, at: Date): Promise<Outcome> {
    const senderId = m?.sender?.id != null ? String(m.sender.id) : null;
    if (!senderId) return { status: 'ignored', note: 'Mensagem sem remetente.' };
    if (senderId === account.externalId) return this.handleEcho(account, m, at);
    const mid: string | undefined = m?.message?.mid;
    const mapped = mapInstagramMessage(m);

    const result = await this.db.transaction(async (tx) => {
      const contact = await this.upsertContact(tx, account, senderId, mapped.source, at);
      const conv = await this.upsertConversation(tx, account, contact.id, at);
      const inserted = await tx
        .insert(messages)
        .values({
          workspaceId: account.workspaceId,
          conversationId: conv.id,
          direction: 'inbound',
          sender: 'contact',
          externalId: mid ?? null,
          type: mapped.type,
          text: mapped.text,
          payload: mapped.payload,
          sentAt: at,
        })
        .onConflictDoNothing({ target: [messages.workspaceId, messages.externalId] })
        .returning({ id: messages.id });
      if (inserted.length) {
        await tx
          .update(conversations)
          .set({
            lastMessageAt: sql`greatest(${conversations.lastMessageAt}, ${at.toISOString()}::timestamptz)`,
            lastInboundAt: sql`greatest(${conversations.lastInboundAt}, ${at.toISOString()}::timestamptz)`,
            unreadCount: sql`${conversations.unreadCount} + 1`,
            status: sql`case when ${conversations.status} = 'resolved' then 'new'::conversation_status when ${conversations.status} = 'waiting_reply' then 'waiting_agent'::conversation_status else ${conversations.status} end`,
            updatedAt: new Date(),
          })
          .where(eq(conversations.id, conv.id));
      }
      return { contact, conv, duplicated: inserted.length === 0 };
    });

    if (result.duplicated) return { status: 'ignored', note: 'Mensagem já registrada.' };
    if (result.contact.inserted || !result.contact.username) await this.enrichContact(account, result.contact.id, senderId);

    const label = result.contact.username ? `@${result.contact.username}` : 'novo contato';
    if (result.contact.inserted) {
      await this.activity.record({ workspaceId: account.workspaceId, type: 'contact.created', entityType: 'contact', entityId: result.contact.id, message: `Novo contato via Instagram (${sourceLabel(mapped.source)})` });
    }
    if (result.conv.inserted) {
      await this.activity.record({ workspaceId: account.workspaceId, type: 'conversation.started', entityType: 'conversation', entityId: result.conv.id, message: `Conversa iniciada com ${label}: "${previewOf(mapped)}"` });
    }
    return { status: 'processed' };
  }

  /** Mensagem enviada pela própria conta (app do Instagram ou pela plataforma). */
  private async handleEcho(account: Account, m: any, at: Date): Promise<Outcome> {
    const contactId = m?.recipient?.id != null ? String(m.recipient.id) : null;
    if (!contactId || contactId === account.externalId) return { status: 'ignored', note: 'Eco sem destinatário.' };
    const mid: string | undefined = m?.message?.mid;
    const mapped = mapInstagramMessage(m);
    const duplicated = await this.db.transaction(async (tx) => {
      const contact = await this.upsertContact(tx, account, contactId, 'business_initiated', at, false);
      const conv = await this.upsertConversation(tx, account, contact.id, at);
      const inserted = await tx
        .insert(messages)
        .values({ workspaceId: account.workspaceId, conversationId: conv.id, direction: 'outbound', sender: 'business_app', externalId: mid ?? null, type: mapped.type, text: mapped.text, payload: mapped.payload, sentAt: at })
        .onConflictDoNothing({ target: [messages.workspaceId, messages.externalId] })
        .returning({ id: messages.id });
      if (inserted.length) {
        await tx
          .update(conversations)
          .set({
            lastMessageAt: sql`greatest(${conversations.lastMessageAt}, ${at.toISOString()}::timestamptz)`,
            lastOutboundAt: sql`greatest(${conversations.lastOutboundAt}, ${at.toISOString()}::timestamptz)`,
            updatedAt: new Date(),
          })
          .where(eq(conversations.id, conv.id));
      }
      return inserted.length === 0;
    });
    return duplicated ? { status: 'ignored', note: 'Mensagem enviada já registrada.' } : { status: 'processed' };
  }

  /** Comentário em publicação/Reel: registra o contato. Gatilhos de comentário entram na Fase 2. */
  private async handleComment(account: Account, change: any): Promise<Outcome> {
    const v = change?.value ?? {};
    const fromId = v?.from?.id != null ? String(v.from.id) : null;
    if (!fromId) return { status: 'ignored', note: 'Comentário sem autor.' };
    if (fromId === account.externalId) return { status: 'ignored', note: 'Comentário da própria conta.' };
    const at = new Date();
    const contact = await this.db.transaction((tx) => this.upsertContact(tx, account, fromId, 'comment', at, true, v.from.username));
    if (contact.inserted) {
      await this.activity.record({ workspaceId: account.workspaceId, type: 'contact.created', entityType: 'contact', entityId: contact.id, message: `Novo contato via comentário${v.from.username ? ` (@${v.from.username})` : ''}` });
    }
    return { status: 'processed' };
  }

  private async upsertContact(tx: Tx, account: Account, externalId: string, source: string, at: Date, touchInteraction = true, username?: string) {
    const [row] = await tx
      .insert(contacts)
      .values({
        workspaceId: account.workspaceId,
        channel: account.channel,
        channelAccountId: account.id,
        externalId,
        username: username ?? null,
        source,
        firstSeenAt: at,
        lastInteractionAt: touchInteraction ? at : null,
      })
      .onConflictDoUpdate({
        target: [contacts.workspaceId, contacts.channel, contacts.externalId],
        set: {
          lastInteractionAt: touchInteraction ? sql`greatest(${contacts.lastInteractionAt}, ${at.toISOString()}::timestamptz)` : sql`${contacts.lastInteractionAt}`,
          username: username ? username : sql`${contacts.username}`,
          channelAccountId: sql`coalesce(${contacts.channelAccountId}, excluded.channel_account_id)`,
          updatedAt: new Date(),
        },
      })
      .returning({ id: contacts.id, username: contacts.username, inserted: sql<boolean>`(xmax = 0)` });
    return row;
  }

  private async upsertConversation(tx: Tx, account: Account, contactId: string, at: Date) {
    const [row] = await tx
      .insert(conversations)
      .values({ workspaceId: account.workspaceId, channelAccountId: account.id, contactId, createdAt: at })
      .onConflictDoUpdate({ target: [conversations.channelAccountId, conversations.contactId], set: { updatedAt: new Date() } })
      .returning({ id: conversations.id, inserted: sql<boolean>`(xmax = 0)` });
    return row;
  }

  /** Busca nome/username/foto do contato na Meta. Falha não interrompe o processamento. */
  private async enrichContact(account: Account, contactId: string, igsid: string) {
    try {
      const token = this.accounts.decryptToken(account);
      const profile = await this.graph.getUserProfile(token, igsid);
      const firstName = profile.name?.trim().split(/\s+/)[0] ?? null;
      await this.db
        .update(contacts)
        .set({ name: profile.name ?? null, firstName, username: profile.username ?? null, profilePictureUrl: profile.profilePic ?? null, updatedAt: new Date() })
        .where(eq(contacts.id, contactId));
    } catch (err) {
      if (err instanceof MetaApiError && err.isAuthError) await this.accounts.markError(account, err);
      this.logger.warn(`Perfil do contato ${igsid} indisponível: ${(err as Error).message}`);
    }
  }
}

function sourceLabel(source: string) {
  return ({ dm: 'mensagem direta', story_reply: 'resposta ao story', story_mention: 'menção no story', comment: 'comentário', ad_or_link: 'anúncio ou link' } as Record<string, string>)[source] ?? source;
}
