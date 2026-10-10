import * as dns from 'dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { configureApp } from './app.setup';

async function bootstrap() {
  // Fail-fast: sin secreto de firma la app no debe arrancar (nunca usar un fallback).
  if (!process.env.JWT_SECRET) {
    throw new Error(
      'JWT_SECRET no está configurado — la aplicación no puede arrancar sin él',
    );
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);

  const port = app.get(ConfigService).get<number>('PORT') || 3000;
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
