import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { AuthedRequest, SESSION_COOKIE } from './auth.types';
import { IS_PUBLIC } from './decorators';

/** Guard global: toda rota exige sessão válida, exceto as marcadas com @Public(). */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly auth: AuthService) {}

  async canActivate(ctx: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const user = await this.auth.resolveSession(req.cookies?.[SESSION_COOKIE]);
    if (user) req.user = user;
    if (isPublic) return true;
    if (!user) throw new UnauthorizedException({ code: 'unauthenticated', message: 'Sessão expirada. Entre novamente.' });
    return true;
  }
}
