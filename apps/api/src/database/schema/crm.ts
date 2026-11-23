import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, integer } from 'drizzle-orm/pg-core';
import {
  automationStatusEnum,
  channelEnum,
  conversationStatusEnum,
  messageDirectionEnum,
  messageSenderEnum,
} from './enums';
import { users, workspaces } from './identity';
import { channelAccounts } from './channels';

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    channel: channelEnum('channel').notNull(),
    channelAccountId: uuid('channel_account_id').references(() => channelAccounts.id, { onDelete: 'set null' }),
    /** Identificador do contato no provedor (IGSID no Instagram). */
    externalId: text('external_id').notNull(),
    username: text('username'),
    name: text('name'),
    firstName: text('first_name'),
    email: text('email'),
    phone: text('phone'),
    profilePictureUrl: text('profile_picture_url'),
    /** Origem da primeira interação: dm, comment, story_reply, story_mention... */
    source: text('source'),
    assignedUserId: uuid('assigned_user_id').references(() => users.id, { onDelete: 'set null' }),
    firstSeenAt: ts('first_seen_at').notNull().defaultNow(),
    lastInteractionAt: ts('last_interaction_at'),
    /** Preenchido quando o contato informa e-mail ou telefone pela primeira vez. */
    leadCapturedAt: ts('lead_captured_at'),
    /** Preenchido quando uma conversão é registrada (ação de fluxo, integração ou atendente). */
    convertedAt: ts('converted_at'),
    optedOutAt: ts('opted_out_at'),
    customFields: jsonb('custom_fields').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('contacts_workspace_external_uq').on(t.workspaceId, t.channel, t.externalId),
    index('contacts_workspace_created_idx').on(t.workspaceId, t.createdAt),
  ],
);

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    channelAccountId: uuid('channel_account_id').notNull().references(() => channelAccounts.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
    status: conversationStatusEnum('status').notNull().default('new'),
    assignedUserId: uuid('assigned_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** Quando true, nenhuma automação envia mensagens nesta conversa (atendimento humano). */
    automationPaused: boolean('automation_paused').notNull().default(false),
    lastMessageAt: ts('last_message_at'),
    /** Última mensagem do contato: base da janela de 24h de mensagens da Meta. */
    lastInboundAt: ts('last_inbound_at'),
    lastOutboundAt: ts('last_outbound_at'),
    unreadCount: integer('unread_count').notNull().default(0),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('conversations_account_contact_uq').on(t.channelAccountId, t.contactId),
    index('conversations_workspace_status_idx').on(t.workspaceId, t.status),
    index('conversations_workspace_last_msg_idx').on(t.workspaceId, t.lastMessageAt),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
    direction: messageDirectionEnum('direction').notNull(),
    sender: messageSenderEnum('sender').notNull(),
    senderUserId: uuid('sender_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** ID da mensagem no provedor (mid). Único por empresa para evitar duplicidade. */
    externalId: text('external_id'),
    /** text, image, video, audio, file, story_mention, story_reply, share, reaction, unsupported... */
    type: text('type').notNull(),
    text: text('text'),
    payload: jsonb('payload'),
    sentAt: ts('sent_at').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('messages_workspace_external_uq').on(t.workspaceId, t.externalId),
    index('messages_conversation_idx').on(t.conversationId, t.sentAt),
    index('messages_workspace_sent_idx').on(t.workspaceId, t.sentAt),
  ],
);

/**
 * Cadastro das automações. Na Fase 1 a tabela existe para que o painel conte automações ativas
 * de verdade; o fluxo versionado, gatilhos e execuções entram na Fase 2.
 */
export const automations = pgTable(
  'automations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    channel: channelEnum('channel').notNull(),
    status: automationStatusEnum('status').notNull().default('draft'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index('automations_workspace_status_idx').on(t.workspaceId, t.status)],
);
