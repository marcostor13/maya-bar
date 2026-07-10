import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
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
