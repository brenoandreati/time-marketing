import { CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Inject, Injectable, NotFoundException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../../database/client';
import { DB } from '../../database/database.module';
import { workspaceMembers, workspaces } from '../../database/schema';
import type { AuthedRequest } from '../auth/auth.types';
import { can, Permission, WorkspaceRole } from './permissions';

export const REQUIRED_PERMISSION = 'requiredPermission';
/** Exige que o usuário seja membro da empresa (:workspaceId) e tenha a permissão indicada. */
export const RequirePermission = (permission: Permission) => SetMetadata(REQUIRED_PERMISSION, permission);

export type WorkspaceContext = { id: string; slug: string; name: string; role: WorkspaceRole; status: 'active' | 'blocked' };
type WsRequest = AuthedRequest & { workspace?: WorkspaceContext };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Isolamento entre empresas: toda rota com :workspaceId passa por aqui. O usuário precisa ser membro;
 * administradores da plataforma NÃO herdam acesso aos dados das empresas por esta rota.
 * Para não revelar a existência de outras empresas, não-membros recebem 404.
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, @Inject(DB) private readonly db: Database) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<WsRequest>();
    const workspaceId = req.params?.workspaceId as string | undefined;
    if (typeof workspaceId !== 'string' || !UUID.test(workspaceId) || !req.user) {
      throw new NotFoundException({ code: 'workspace_not_found', message: 'Empresa não encontrada.' });
    }
    const rows = await this.db
      .select({ id: workspaces.id, slug: workspaces.slug, name: workspaces.name, status: workspaces.status, role: workspaceMembers.role })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, req.user.id)))
      .limit(1);
    const ws = rows[0];
    if (!ws) throw new NotFoundException({ code: 'workspace_not_found', message: 'Empresa não encontrada.' });
    if (ws.status === 'blocked') {
      throw new ForbiddenException({ code: 'workspace_blocked', message: 'Esta empresa está bloqueada. Fale com o suporte.' });
    }
    const permission = this.reflector.getAllAndOverride<Permission | undefined>(REQUIRED_PERMISSION, [ctx.getHandler(), ctx.getClass()]);
    if (permission && !can(ws.role, permission)) {
      throw new ForbiddenException({ code: 'forbidden', message: 'Sua função não permite esta ação.' });
    }
    req.workspace = ws;
    return true;
  }
}

export const CurrentWorkspace = createParamDecorator((_: unknown, ctx: ExecutionContext): WorkspaceContext => {
  return ctx.switchToHttp().getRequest<WsRequest>().workspace!;
});
