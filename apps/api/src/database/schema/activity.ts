import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { activityLevelEnum } from './enums';
import { users, workspaces } from './identity';

/**
 * Registro de atividades e auditoria. Alimenta o feed do painel e o histórico de ações
 * (quem fez o quê, quando). `workspaceId` nulo = evento da plataforma.
 */
export const activityLogs = pgTable(
  'activity_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** ex.: auth.login, workspace.created, channel.connected, contact.created, webhook.failed */
    type: text('type').notNull(),
    level: activityLevelEnum('level').notNull().default('info'),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    message: text('message').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    ip: text('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('activity_logs_workspace_created_idx').on(t.workspaceId, t.createdAt)],
);
