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

  // rawBody: la firma de los webhooks de Meta se calcula sobre el cuerpo crudo.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  configureApp(app);
  // Salud para la comprobación posterior al despliegue (deploy.yml): pública y
  // fuera de Nest, sin guards ni base de datos.
  app
    .getHttpAdapter()
    .get('/healthz', (_req, res: { json: (b: object) => void }) =>
      res.json({ ok: true }),
    );

  const port = app.get(ConfigService).get<number>('PORT') || 3000;
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
