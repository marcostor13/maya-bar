import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const frontendUrl = configService.get<string>('FRONTEND_URL');
  app.enableCors({
    origin: frontendUrl
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
