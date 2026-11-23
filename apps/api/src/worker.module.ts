import { Module } from '@nestjs/common';
import { CORE_MODULES } from './app.module';
import { InboundModule } from './modules/inbound/inbound.module';
import { WorkerService } from './worker.service';

@Module({
  imports: [...CORE_MODULES, InboundModule],
  providers: [WorkerService],
})
export class WorkerModule {}
