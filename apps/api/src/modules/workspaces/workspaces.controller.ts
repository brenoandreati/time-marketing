import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { parseBody } from '../../common/http/zod-body';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators';
import { ActivityService } from '../activity/activity.service';
import { ROLE_LABELS } from './permissions';
import { CurrentWorkspace, RequirePermission, WorkspaceContext, WorkspaceGuard } from './workspace.guard';
import { WorkspacesService } from './workspaces.service';

const timezone = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, 'Fuso horário inválido.');

const createSchema = z.object({ name: z.string().trim().min(2, 'Informe o nome da empresa.').max(80), timezone: timezone.optional() });
const updateSchema = z.object({ name: z.string().trim().min(2).max(80).optional(), timezone: timezone.optional() });

@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly service: WorkspacesService, private readonly activity: ActivityService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return { workspaces: await this.service.listForUser(user.id) };
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return { workspace: await this.service.create(user.id, parseBody(createSchema, body)) };
  }

  @UseGuards(WorkspaceGuard)
  @RequirePermission('dashboard.read')
  @Get(':workspaceId')
  async get(@CurrentWorkspace() ws: WorkspaceContext) {
    return { workspace: { ...(await this.service.details(ws.id)), role: ws.role, roleLabel: ROLE_LABELS[ws.role] } };
  }

  @UseGuards(WorkspaceGuard)
  @RequirePermission('workspace.manage')
  @Patch(':workspaceId')
  async update(@CurrentWorkspace() ws: WorkspaceContext, @CurrentUser() user: AuthUser, @Body() body: unknown) {
    return { workspace: await this.service.update(ws.id, user.id, parseBody(updateSchema, body)) };
  }

  @UseGuards(WorkspaceGuard)
  @RequirePermission('members.read')
  @Get(':workspaceId/members')
  async members(@CurrentWorkspace() ws: WorkspaceContext) {
    const rows = await this.service.members(ws.id);
    return { members: rows.map((m) => ({ ...m, roleLabel: ROLE_LABELS[m.role] })) };
  }

  @UseGuards(WorkspaceGuard)
  @RequirePermission('dashboard.read')
  @Get(':workspaceId/activity')
  async activityFeed(@CurrentWorkspace() ws: WorkspaceContext, @Param('workspaceId') _id: string) {
    return { items: await this.activity.list(ws.id, { limit: 20 }) };
  }
}
