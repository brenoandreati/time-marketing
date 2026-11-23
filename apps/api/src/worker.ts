import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadDotenv } from './config/load-dotenv';

async function bootstrap() {
  loadDotenv();
  const { WorkerModule } = await import('./worker.module');
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
}

bootstrap();
