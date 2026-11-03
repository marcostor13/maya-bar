import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { ActiveUserCache } from './active-user.cache';
import { UsersModule } from '../users/users.module';
import { TenantsModule } from '../tenants/tenants.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailModule } from '../mail/mail.module';
import { RefreshToken, RefreshTokenSchema } from './refresh-token.schema';
import { ThrottlerModule } from '@nestjs/throttler';
import { TurnstileService } from './turnstile.service';

@Module({
  imports: [
    forwardRef(() => UsersModule),
    TenantsModule,
    MailModule,
    PassportModule,
    // Límite por IP de las rutas de /auth. El tope por defecto (60/min) solo
    // lo notan los bots; cada ruta sensible fija el suyo con @Throttle. Las
    // pruebas lo saltan: registran decenas de cuentas desde la misma IP.
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 60 }],
      errorMessage:
        'Demasiados intentos. Espera unos minutos y vuelve a probar.',
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    MongooseModule.forFeature([
      { name: RefreshToken.name, schema: RefreshTokenSchema },
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        // Un día: lo bastante largo para no molestar y lo bastante corto para
        // que un token robado caduque solo. La sesión se mantiene viva con el
        // refresh token, que sí es de larga duración y se puede revocar.
        signOptions: { expiresIn: '1d' },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [AuthService, JwtStrategy, ActiveUserCache, TurnstileService],
  controllers: [AuthController],
  exports: [ActiveUserCache],
})
export class AuthModule {}
