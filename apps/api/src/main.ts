import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadDotenv } from './config/load-dotenv';

async function bootstrap() {
  loadDotenv();
  const { loadEnv } = await import('./config/env');
  const env = loadEnv();
  const { AppModule } = await import('./app.module');
  const { configureApp } = await import('./bootstrap');
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  configureApp(app);
  await app.listen(env.API_PORT);
  Logger.log(`API ouvindo em http://localhost:${env.API_PORT}`, 'Bootstrap');
}

bootstrap();
