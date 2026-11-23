import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { InboundProcessorService } from './inbound-processor.service';
import { MaintenanceService } from './maintenance.service';

/** Processamento assíncrono de eventos recebidos e rotinas de manutenção (executados pelo worker). */
@Module({ imports: [ChannelsModule], providers: [InboundProcessorService, MaintenanceService], exports: [InboundProcessorService, MaintenanceService] })
export class InboundModule {}
