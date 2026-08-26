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
  }) {
    if (!(await this.activeUsers.isActive(payload.sub)))
      throw new UnauthorizedException('Tu cuenta ya no está activa');
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      tenantId: payload.tenantId ?? '',
      localIds: payload.localIds ?? [],
    };
  }
}
