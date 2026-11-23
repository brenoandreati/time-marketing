import { pgEnum } from 'drizzle-orm/pg-core';

export const workspaceRoleEnum = pgEnum('workspace_role', ['admin', 'manager', 'agent', 'analyst', 'viewer']);
export const workspaceStatusEnum = pgEnum('workspace_status', ['active', 'blocked']);

/** Canais suportados. Novos canais (whatsapp, messenger, telegram) entram aqui sem mudar o restante do modelo. */
export const channelEnum = pgEnum('channel', ['instagram']);

export const channelAccountStatusEnum = pgEnum('channel_account_status', [
  'connected',
  'token_expired',
  'revoked',
  'error',
  'disconnected',
]);

export const webhookEventStatusEnum = pgEnum('webhook_event_status', [
  'received',
  'processing',
  'processed',
  'ignored',
  'failed',
]);

export const conversationStatusEnum = pgEnum('conversation_status', [
  'new',
  'waiting_agent',
  'in_progress',
  'waiting_reply',
  'resolved',
]);

export const messageDirectionEnum = pgEnum('message_direction', ['inbound', 'outbound']);
export const messageSenderEnum = pgEnum('message_sender', ['contact', 'automation', 'agent', 'ai', 'business_app', 'system']);

export const automationStatusEnum = pgEnum('automation_status', ['draft', 'active', 'paused', 'error', 'archived']);

export const activityLevelEnum = pgEnum('activity_level', ['info', 'warning', 'error']);
