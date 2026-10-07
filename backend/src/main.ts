import * as dns from 'dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { AllExceptionsFilter } from './shared/http-exception.filter';
import { ShortDomainMiddleware } from './links/redirect.controller';

async function bootstrap() {
  // Fail-fast: sin secreto de firma la app no debe arrancar (nunca usar un fallback).
  if (!process.env.JWT_SECRET) {
    throw new Error(
      'JWT_SECRET no está configurado — la aplicación no puede arrancar sin él',
    );
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // El límite por defecto (100 kB) se queda corto para una plantilla de email
  // con su diseño y su HTML compilado.
  app.useBodyParser('json', { limit: '2mb' });

  // Links cortos en dominio propio: se resuelven por `Host` antes que
  // cualquier ruta, porque en ese dominio la API no existe.
  const shortDomains = app.get(ShortDomainMiddleware);
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Un fallo aquí no debe tumbar la API: se sigue con la ruta normal.
    shortDomains.use(req, res, next).catch(() => {
      if (!res.headersSent) next();
    });
  });
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

  // La app nativa (Capacitor) no manda el dominio del sitio como origen: con
  // `androidScheme: 'https'` el WebView se identifica como `https://localhost`.
  // Se añaden SIEMPRE, también cuando CORS_ORIGINS está fijado, o la app
  // arranca pero ninguna petición pasa.
  const nativeAppOrigins = ['https://localhost', 'capacitor://localhost'];

  const configuredOrigins = corsOrigins
    ? corsOrigins
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : frontendUrl
      ? [
          frontendUrl,
          'http://localhost:4200',
          'https://mayacrm.site',
          'https://www.mayacrm.site',
        ]
      : null;

  app.enableCors({
    origin: configuredOrigins
      ? [...new Set([...configuredOrigins, ...nativeAppOrigins])]
      : true,
    credentials: true,
  });
  const port = configService.get<number>('PORT') || 3000;
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
