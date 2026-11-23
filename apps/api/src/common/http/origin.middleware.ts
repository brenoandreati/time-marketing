import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Proteção contra CSRF para rotas autenticadas por cookie: requisições que alteram estado
 * precisam vir da origem do frontend. Webhooks (assinados) ficam de fora.
 */
export function createOriginGuard(allowedOrigins: string[]) {
  @Injectable()
  class OriginMiddleware implements NestMiddleware {
    use(req: Request, _res: Response, next: NextFunction) {
      if (SAFE_METHODS.has(req.method) || req.path.startsWith('/webhooks/')) return next();
      const origin = req.headers.origin;
      if (!origin) {
        // Sem Origin (ex.: clientes de servidor). Só aceita se não houver cookie de sessão envolvido.
        if (!req.headers.cookie) return next();
        throw new ForbiddenException({ code: 'invalid_origin', message: 'Origem da requisição não permitida.' });
      }
      if (!allowedOrigins.includes(origin)) {
        throw new ForbiddenException({ code: 'invalid_origin', message: 'Origem da requisição não permitida.' });
      }
      next();
    }
  }
  return OriginMiddleware;
}
