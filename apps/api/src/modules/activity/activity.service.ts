import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, lt } from 'drizzle-orm';
import { DB } from '../../database/database.module';
import type { Database } from '../../database/client';
import { activityLogs } from '../../database/schema';

export type ActivityInput = {
  workspaceId?: string | null;
  actorUserId?: string | null;
  type: string;
  level?: 'info' | 'warning' | 'error';
  entityType?: string;
  entityId?: string;
  message: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
};

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(@Inject(DB) private readonly db: Database) {}

  /** Nunca lança: falha ao registrar atividade não pode derrubar a operação principal. */
  async record(input: ActivityInput, tx: Pick<Database, 'insert'> = this.db) {
    try {
      await tx.insert(activityLogs).values({ ...input, level: input.level ?? 'info' });
    } catch (err) {
      this.logger.error(`Falha ao registrar atividade ${input.type}: ${(err as Error).message}`);
    }
  }

  async list(workspaceId: string, opts: { limit?: number; before?: Date } = {}) {
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
    return this.db
      .select({
        id: activityLogs.id,
        type: activityLogs.type,
        level: activityLogs.level,
        message: activityLogs.message,
        entityType: activityLogs.entityType,
        entityId: activityLogs.entityId,
        createdAt: activityLogs.createdAt,
        actorUserId: activityLogs.actorUserId,
      })
      .from(activityLogs)
      .where(and(eq(activityLogs.workspaceId, workspaceId), opts.before ? lt(activityLogs.createdAt, opts.before) : undefined))
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit);
  }
}
