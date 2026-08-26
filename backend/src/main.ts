import * as dns from 'dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { AllExceptionsFilter } from './shared/http-exception.filter';

async function bootstrap() {
  // Fail-fast: sin secreto de firma la app no debe arrancar (nunca usar un fallback).
  if (!process.env.JWT_SECRET) {
    throw new Error(
      'JWT_SECRET no está configurado — la aplicación no puede arrancar sin él',
    );
  }

  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // whitelist recorta propiedades sin decorador en el DTO (protege contra mass-assignment
  // en services que hacen `$set: dto`). Sin forbidNonWhitelisted: el frontend envía objetos
  // completos (_id, createdAt, ...) en varios PATCH y deben recortarse sin error.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());

  // La API pública de formularios se embebe en landings de terceros, así que
  // debe aceptar cualquier origen. Va ANTES de enableCors: el middleware de
  // `cors` no pisa la cabecera si el origen no está en su lista blanca.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!req.originalUrl.startsWith('/public/forms')) return next();
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  const corsOrigins = configService.get<string>('CORS_ORIGINS');
  const frontendUrl = configService.get<string>('FRONTEND_URL');
  app.enableCors({
    origin: corsOrigins
      ? corsOrigins
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean)
      : frontendUrl
        ? [
            frontendUrl,
            'http://localhost:4200',
            'https://casagarbo.netlify.com',
            'https://gruposolar.netlify.app',
            'https://mayabar.marcostorresalarcon.com',
          ]
        : true,
    credentials: true,
  });
  const port = configService.get<number>('PORT') || 3000;
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
