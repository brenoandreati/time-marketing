import { Controller, ForbiddenException, Get, HttpCode, Inject, Logger, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { verifyMetaSignature } from '../../common/crypto/crypto';
import { Public } from '../auth/decorators';
import { parseInstagramWebhook, WebhookPayloadError } from './instagram-webhook.parser';
import { WebhookIngestService } from './webhook-ingest.service';

type RawRequest = Request & { rawBody?: Buffer };

@Public()
@SkipThrottle()
@Controller('webhooks/instagram')
export class InstagramWebhookController {
  private readonly logger = new Logger('InstagramWebhook');

  constructor(@Inject(ENV) private readonly env: Env, private readonly ingest: WebhookIngestService) {}

  /** Verificação do endpoint feita pela Meta ao cadastrar o webhook no painel do app. */
  @Get()
  verify(@Query('hub.mode') mode: string, @Query('hub.verify_token') token: string, @Query('hub.challenge') challenge: string, @Res() res: Response) {
    const expected = this.env.META_WEBHOOK_VERIFY_TOKEN;
    if (!expected) throw new ForbiddenException({ code: 'meta_not_configured', message: 'Webhook não configurado.' });
    const ok = mode === 'subscribe' && typeof token === 'string' && safeEqual(token, expected) && typeof challenge === 'string';
    if (!ok) throw new ForbiddenException({ code: 'invalid_verify_token', message: 'Token de verificação inválido.' });
    res.status(200).type('text/plain').send(challenge);
  }

  /**
   * Recebimento de eventos. Valida a assinatura X-Hub-Signature-256 sobre o corpo bruto,
   * persiste e responde 200 rapidamente; o processamento acontece no worker.
   */
  @Post()
  @HttpCode(200)
  async receive(@Req() req: RawRequest) {
    const secret = this.env.META_APP_SECRET;
    if (!secret) throw new ForbiddenException({ code: 'meta_not_configured', message: 'Webhook não configurado.' });
    const raw = req.rawBody;
    if (!raw || !verifyMetaSignature(raw, req.header('x-hub-signature-256'), secret)) {
      this.logger.warn(`Assinatura inválida em webhook (ip ${req.ip})`);
      throw new UnauthorizedException({ code: 'invalid_signature', message: 'Assinatura inválida.' });
    }
    let items;
    try {
      items = parseInstagramWebhook(req.body);
    } catch (err) {
      if (err instanceof WebhookPayloadError) {
        // Assinatura válida mas formato inesperado: responde 200 para a Meta não reenviar indefinidamente.
        this.logger.warn(`Webhook ignorado: ${err.message}`);
        return { ok: true, ignored: true };
      }
      throw err;
    }
    const result = await this.ingest.ingestInstagram(items);
    return { ok: true, ...result };
  }
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
