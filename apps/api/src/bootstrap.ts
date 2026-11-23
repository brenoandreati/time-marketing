import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';

/** Configuração HTTP comum (usada pelo main.ts e pelos testes de integração). */
export function configureApp(app: INestApplication) {
  const instance = app.getHttpAdapter().getInstance() as express.Express;
  instance.set('trust proxy', 1);
  instance.disable('x-powered-by');
  app.use(helmet());
  app.use(cookieParser());
  // Guarda o corpo bruto: a assinatura dos webhooks da Meta é calculada sobre os bytes originais.
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        (req as unknown as { rawBody: Buffer }).rawBody = Buffer.from(buf);
      },
    }),
  );
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.enableShutdownHooks();
  return app;
}
