import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { AllExceptionsFilter } from './shared/http-exception.filter';
import { ShortDomainMiddleware } from './links/redirect.controller';

/**
 * Todo lo que se le monta a la app entre crearla y ponerla a escuchar. Vive
 * aparte de `main.ts` para que las pruebas e2e arranquen exactamente la misma
 * aplicación (mismos pipes, filtro, CORS y middleware) y no una copia que se
 * desincronice.
 */
export function configureApp(app: NestExpressApplication): void {
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
}
