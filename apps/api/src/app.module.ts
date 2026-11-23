import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from './config/config.module';
import { loadEnv } from './config/env';
import { CryptoModule } from './common/crypto/crypto.module';
import { HttpExceptionFilter } from './common/http/http-exception.filter';
import { createOriginGuard } from './common/http/origin.middleware';
import { DatabaseModule } from './database/database.module';
import { ActivityModule } from './modules/activity/activity.module';
import { AuthModule } from './modules/auth/auth.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { HealthController } from './modules/health/health.controller';
import { QueueModule } from './modules/queue/queue.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';

/** Infraestrutura compartilhada entre API e worker. */
export const CORE_MODULES = [AppConfigModule, DatabaseModule, CryptoModule, QueueModule, ActivityModule];

@Module({
  imports: [
    ...CORE_MODULES,
    // DISABLE_RATE_LIMIT=1 só é usado na suíte de testes, que cria dezenas de contas por minuto.
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 300 }], skipIf: () => process.env.DISABLE_RATE_LIMIT === '1' }),
    AuthModule,
    WorkspacesModule,
    ChannelsModule,
    WebhooksModule,
    DashboardModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    const env = loadEnv();
    consumer.apply(createOriginGuard([env.WEB_URL])).forRoutes('*');
  }
}
