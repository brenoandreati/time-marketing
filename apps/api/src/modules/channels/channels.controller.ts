import { Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import type { AuthedRequest, AuthUser } from '../auth/auth.types';
import { CurrentUser, Public } from '../auth/decorators';
import { CurrentWorkspace, RequirePermission, WorkspaceContext, WorkspaceGuard } from '../workspaces/workspace.guard';
import { ChannelAccountsService } from './channel-accounts.service';

@UseGuards(WorkspaceGuard)
@Controller('workspaces/:workspaceId/channel-accounts')
export class ChannelAccountsController {
  constructor(private readonly service: ChannelAccountsService) {}

  @RequirePermission('channels.read')
  @Get()
  async list(@CurrentWorkspace() ws: WorkspaceContext) {
    const [accounts, limit] = await Promise.all([this.service.list(ws.id), this.service.limits(ws.id)]);
    return { accounts, limit, availability: this.service.availability() };
  }

  @RequirePermission('channels.manage')
  @Post('instagram/connect')
  connect(@CurrentWorkspace() ws: WorkspaceContext, @CurrentUser() user: AuthUser) {
    return this.service.startInstagramConnect(ws.id, user.id);
  }

  @RequirePermission('channels.manage')
  @HttpCode(200)
  @Post(':id/check')
  async check(@CurrentWorkspace() ws: WorkspaceContext, @CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return { account: await this.service.check(ws.id, id, user.id) };
  }

  @RequirePermission('channels.manage')
  @HttpCode(200)
  @Post(':id/refresh-token')
  async refresh(@CurrentWorkspace() ws: WorkspaceContext, @CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return { account: await this.service.refreshTokenById(ws.id, id, user.id) };
  }

  @RequirePermission('channels.manage')
  @HttpCode(204)
  @Delete(':id')
  async disconnect(@CurrentWorkspace() ws: WorkspaceContext, @CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.service.disconnect(ws.id, id, user.id);
  }
}

/** Destino do redirecionamento OAuth da Meta. Conclui a conexão e devolve o usuário ao frontend. */
@Controller('integrations/instagram')
export class InstagramOAuthController {
  constructor(private readonly service: ChannelAccountsService, @Inject(ENV) private readonly env: Env) {}

  @Public()
  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ) {
    const result = await this.service.completeInstagramConnect({ code, state, error, errorDescription }, req.user?.id);
    const base = result.workspaceSlug ? `${this.env.WEB_URL}/w/${result.workspaceSlug}/contas` : `${this.env.WEB_URL}/`;
    const qs = result.ok ? new URLSearchParams({ connected: result.accountId }) : new URLSearchParams({ error: result.error, message: result.message });
    res.redirect(302, `${base}?${qs}`);
  }
}
