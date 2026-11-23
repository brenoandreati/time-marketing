import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, isNull } from 'drizzle-orm';
import type { Database } from '../../database/client';
import { DB } from '../../database/database.module';
import { automations, channelAccounts, contacts, plans, users, workspaceMembers, workspaces } from '../../database/schema';
import { ActivityService } from '../activity/activity.service';
import { ROLE_PERMISSIONS, WorkspaceRole } from './permissions';

export function slugify(name: string) {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'empresa';
}

@Injectable()
export class WorkspacesService {
  constructor(@Inject(DB) private readonly db: Database, private readonly activity: ActivityService) {}

  async listForUser(userId: string) {
    const rows = await this.db
      .select({ id: workspaces.id, name: workspaces.name, slug: workspaces.slug, status: workspaces.status, role: workspaceMembers.role })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(workspaceMembers.userId, userId))
      .orderBy(asc(workspaces.name));
    return rows.map((r) => ({ ...r, permissions: [...ROLE_PERMISSIONS[r.role]] }));
  }

  async create(userId: string, input: { name: string; timezone?: string }) {
    const [plan] = await this.db.select().from(plans).where(and(eq(plans.isDefault, true), eq(plans.isActive, true))).limit(1);
    if (!plan) throw new BadRequestException({ code: 'no_default_plan', message: 'Nenhum plano padrão configurado na plataforma.' });

    return this.db.transaction(async (tx) => {
      const slug = await this.uniqueSlug(tx, slugify(input.name));
      const [ws] = await tx
        .insert(workspaces)
        .values({ name: input.name.trim(), slug, planId: plan.id, timezone: input.timezone ?? 'America/Sao_Paulo', createdBy: userId })
        .returning();
      await tx.insert(workspaceMembers).values({ workspaceId: ws.id, userId, role: 'admin' });
      await this.activity.record(
        { workspaceId: ws.id, actorUserId: userId, type: 'workspace.created', entityType: 'workspace', entityId: ws.id, message: `Empresa "${ws.name}" criada` },
        tx,
      );
      return { id: ws.id, name: ws.name, slug: ws.slug, status: ws.status, role: 'admin' as WorkspaceRole, permissions: [...ROLE_PERMISSIONS.admin] };
    });
  }

  async details(workspaceId: string) {
    const [row] = await this.db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        status: workspaces.status,
        timezone: workspaces.timezone,
        createdAt: workspaces.createdAt,
        plan: { code: plans.code, name: plans.name, limits: plans.limits },
      })
      .from(workspaces)
      .innerJoin(plans, eq(plans.id, workspaces.planId))
      .where(eq(workspaces.id, workspaceId));
    const usage = await this.usage(workspaceId);
    return { ...row, usage };
  }

  async update(workspaceId: string, userId: string, input: { name?: string; timezone?: string }) {
    const patch: Partial<typeof workspaces.$inferInsert> = { updatedAt: new Date() };
    if (input.name) patch.name = input.name.trim();
    if (input.timezone) patch.timezone = input.timezone;
    await this.db.update(workspaces).set(patch).where(eq(workspaces.id, workspaceId));
    await this.activity.record({ workspaceId, actorUserId: userId, type: 'workspace.updated', entityType: 'workspace', entityId: workspaceId, message: 'Dados da empresa atualizados', metadata: input });
    return this.details(workspaceId);
  }

  async members(workspaceId: string) {
    return this.db
      .select({ userId: users.id, name: users.name, email: users.email, role: workspaceMembers.role, joinedAt: workspaceMembers.createdAt })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, workspaceId))
      .orderBy(asc(users.name));
  }

  async usage(workspaceId: string) {
    const [[acc], [mem], [ct], [au]] = await Promise.all([
      this.db.select({ n: count() }).from(channelAccounts).where(and(eq(channelAccounts.workspaceId, workspaceId), isNull(channelAccounts.disconnectedAt))),
      this.db.select({ n: count() }).from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId)),
      this.db.select({ n: count() }).from(contacts).where(eq(contacts.workspaceId, workspaceId)),
      this.db.select({ n: count() }).from(automations).where(and(eq(automations.workspaceId, workspaceId), eq(automations.status, 'active'))),
    ]);
    return { channelAccounts: acc.n, members: mem.n, contacts: ct.n, activeAutomations: au.n };
  }

  private async uniqueSlug(tx: Pick<Database, 'select'>, base: string) {
    for (let i = 0; i < 50; i++) {
      const candidate = i === 0 ? base : `${base}-${i + 1}`;
      const exists = await tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.slug, candidate)).limit(1);
      if (!exists.length) return candidate;
    }
    return `${base}-${Date.now().toString(36)}`;
  }
}
