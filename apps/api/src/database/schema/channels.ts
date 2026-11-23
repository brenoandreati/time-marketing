import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { channelAccountStatusEnum, channelEnum, webhookEventStatusEnum } from './enums';
import { users, workspaces } from './identity';

const ts = (name: string) => timestamp(name, { withTimezone: true });

/**
 * Conta de um canal conectada a uma empresa (ex.: um perfil profissional do Instagram).
 * O token fica sempre criptografado (AES-256-GCM) e nunca é devolvido pela API.
 */
export const channelAccounts = pgTable(
  'channel_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    channel: channelEnum('channel').notNull(),
    /** ID da conta no provedor (para o Instagram: o IG User ID que chega em entry.id dos webhooks). */
    externalId: text('external_id').notNull(),
    username: text('username'),
    name: text('name'),
    profilePictureUrl: text('profile_picture_url'),
    accountType: text('account_type'),
    accessTokenEnc: text('access_token_enc'),
    tokenExpiresAt: ts('token_expires_at'),
    tokenRefreshedAt: ts('token_refreshed_at'),
    grantedScopes: text('granted_scopes').array().notNull().default(sql`'{}'::text[]`),
    status: channelAccountStatusEnum('status').notNull().default('connected'),
    lastError: text('last_error'),
    lastErrorAt: ts('last_error_at'),
    lastCheckedAt: ts('last_checked_at'),
    webhookSubscribed: boolean('webhook_subscribed').notNull().default(false),
    webhookFields: text('webhook_fields').array().notNull().default(sql`'{}'::text[]`),
    connectedBy: uuid('connected_by').references(() => users.id, { onDelete: 'set null' }),
    connectedAt: ts('connected_at').notNull().defaultNow(),
    disconnectedAt: ts('disconnected_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    // Uma conta do Instagram só pode estar ativa em uma empresa por vez: os webhooks são roteados pelo ID da conta.
    uniqueIndex('channel_accounts_active_external_uq')
      .on(t.channel, t.externalId)
      .where(sql`${t.disconnectedAt} is null`),
    index('channel_accounts_workspace_idx').on(t.workspaceId),
  ],
);

/** Estado de um fluxo OAuth em andamento (uso único, expira em minutos). */
export const oauthStates = pgTable('oauth_states', {
  id: uuid('id').primaryKey().defaultRandom(),
  stateHash: text('state_hash').notNull().unique(),
  channel: channelEnum('channel').notNull(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

/**
 * Cada item recebido via webhook vira uma linha. `dedupeKey` é único: a Meta reenvia eventos
 * e o mesmo item nunca é processado duas vezes.
 */
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channel: channelEnum('channel').notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    /** Tipo normalizado: message, message_echo, comment, story_mention, reaction, read, postback, etc. */
    eventType: text('event_type').notNull(),
    /** ID da conta do provedor que recebeu o evento (entry.id). */
    recipientExternalId: text('recipient_external_id').notNull(),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    channelAccountId: uuid('channel_account_id').references(() => channelAccounts.id, { onDelete: 'set null' }),
    payload: jsonb('payload').notNull(),
    status: webhookEventStatusEnum('status').notNull().default('received'),
    attempts: integer('attempts').notNull().default(0),
    error: text('error'),
    occurredAt: ts('occurred_at'),
    receivedAt: ts('received_at').notNull().defaultNow(),
    processedAt: ts('processed_at'),
  },
  (t) => [
    uniqueIndex('webhook_events_dedupe_uq').on(t.channel, t.dedupeKey),
    index('webhook_events_workspace_idx').on(t.workspaceId, t.receivedAt),
    index('webhook_events_status_idx').on(t.status),
  ],
);
