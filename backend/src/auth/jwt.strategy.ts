import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ActiveUserCache } from './active-user.cache';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private activeUsers: ActiveUserCache,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /**
   * Async a propósito: además de leer el payload comprueba que el usuario siga
   * activo, para que desactivar o eliminar revoque los tokens ya emitidos en
   * vez de esperar a que caduquen (8 h).
   */
  async validate(payload: {
    sub: string;
    email: string;
    role: string;
    tenantId?: string;
    localIds?: string[];
    iat?: number;
    iatMs?: number;
  }) {
    // Los tokens antiguos no traen iatMs: su iat (segundos) se lleva al final
    // de ese segundo para no darlos por buenos si se revocó en el mismo.
    const issuedAtMs =
      payload.iatMs ??
      (payload.iat !== undefined ? payload.iat * 1000 + 999 : undefined);
    const state = await this.activeUsers.check(payload.sub, issuedAtMs);
    if (state === 'inactive')
      throw new UnauthorizedException('Tu cuenta ya no está activa');
    // El interceptor del frontend renueva la sesión y recibe los datos nuevos
    // (rol, correo); si la revocación fue completa, la renovación también falla.
    if (state === 'revoked')
      throw new UnauthorizedException(
        'Tu sesión ha cambiado. Vuelve a entrar.',
      );
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      tenantId: payload.tenantId ?? '',
      localIds: payload.localIds ?? [],
    };
  }
}
