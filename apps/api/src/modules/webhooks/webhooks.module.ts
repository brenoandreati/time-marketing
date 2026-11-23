import { Module } from '@nestjs/common';
import { InstagramWebhookController } from './instagram-webhook.controller';
import { WebhookIngestService } from './webhook-ingest.service';

@Module({ controllers: [InstagramWebhookController], providers: [WebhookIngestService], exports: [WebhookIngestService] })
export class WebhooksModule {}
