import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash, randomBytes, randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import { UsersService, hashResetCode } from '../users/users.service';
import { UserSessionsService } from '../users/user-sessions.service';
import { TenantsService } from '../tenants/tenants.service';
import { MailService } from '../mail/mail.service';
import { RefreshToken } from './refresh-token.schema';
import type { User } from '../users/user.schema';

/** Cuánto dura la sesión sin volver a escribir la contraseña. */
const REFRESH_TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 días

/** En la base solo se guarda el hash: un volcado no entrega sesiones vivas. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Vigencia del código que confirma el correo de una cuenta nueva. */
const EMAIL_CODE_TTL_MS = 30 * 60 * 1000;
/** Intentos fallidos con un mismo código antes de invalidarlo. */
const EMAIL_CODE_MAX_ATTEMPTS = 5;
const TENANT_SUSPENDED =
  'Tu empresa está suspendida. Contacta con soporte de Maya CRM.';
const GENERIC_RESEND_MESSAGE =
  'Si la cuenta está pendiente de confirmar, te enviamos un código nuevo.';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private jwtService: JwtService,
    private usersService: UsersService,
    private tenantsService: TenantsService,
    private mailService: MailService,
    @InjectModel(RefreshToken.name)
    private refreshTokens: Model<RefreshToken>,
    private sessions: UserSessionsService,
  ) {}

  /**
   * Un usuario desactivado ya no podía entrar (la consulta filtraba por
   * `isActive`), pero recibía "Invalid credentials" y no había forma de saber
   * que el problema era la cuenta y no la contraseña. Ahora se busca sin filtro
   * y el motivo solo se revela tras acertar la contraseña, de modo que esto no
   * sirve para averiguar qué emails existen.
   */
  async validateUser(
    email: string,
    pass: string,
  ): Promise<Record<string, any> | null> {
    const user = await this.usersService.findOneByEmailAnyStatus(email);
    if (!user) return null;

    const matches = await bcrypt.compare(pass, user.password);
    if (!matches) return null;

    if (user.isActive === false)
      throw new UnauthorizedException(
        'Tu cuenta está desactivada. Contacta con el administrador de tu empresa.',
      );
    if (!(await this.tenantsService.isActive(this.tenantOf(user))))
      throw new UnauthorizedException(TENANT_SUSPENDED);

    // Como el aviso de cuenta desactivada, solo se revela con la contraseña
    // correcta. El código permite al frontend llevar a la pantalla del código.
    if (user.emailVerified === false)
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Confirma tu correo para entrar. Te enviamos un código.',
      });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _pw, ...result } = (
      user as unknown as { toObject(): Record<string, any> }
    ).toObject();
    return result;
  }

  /**
   * Emite un refresh token y devuelve el valor en claro (lo único que ve el
   * cliente). En la base solo queda el hash.
   */
  private async issueRefreshToken(
    userId: string,
    userAgent?: string,
    actingTenantId?: string | null,
  ): Promise<string> {
    const token = randomBytes(48).toString('base64url');
    await this.refreshTokens.create({
      userId: new Types.ObjectId(userId),
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      userAgent,
      ...(actingTenantId
        ? { actingTenantId: new Types.ObjectId(actingTenantId) }
        : {}),
    });
    // Toda sesión nueva o renovada pasa por aquí: es el "último acceso".
    await this.sessions.touchAccess(userId);
    return token;
  }

  /**
   * Canjea un refresh token por una sesión nueva y lo rota.
   *
   * Rotar es lo que limita el daño de un token robado: en cuanto el dueño
   * legítimo renueva, la copia del atacante ya está marcada y no sirve.
   */
  async refresh(token: string, userAgent?: string) {
    const registro = await this.refreshTokens.findOne({
      tokenHash: hashToken(token),
    });
    if (!registro || registro.revokedAt || registro.expiresAt < new Date())
      throw new UnauthorizedException('La sesión ha caducado');

    const user = await this.usersService.findById(String(registro.userId));
    if (!user || user.isActive === false) {
      await this.revokeAllFor(String(registro.userId));
      throw new UnauthorizedException('Tu cuenta ya no está activa');
    }
    if (!(await this.tenantsService.isActive(this.tenantOf(user))))
      throw new UnauthorizedException(TENANT_SUSPENDED);

    // Un usuario de agencia sigue en la sub-cuenta donde estaba, si todavía
    // la administra (HU72).
    const acting = await this.actingFor(user, registro.actingTenantId);
    if (acting && !(await this.tenantsService.isActive(acting)))
      throw new UnauthorizedException(TENANT_SUSPENDED);

    registro.revokedAt = new Date();
    await registro.save();

    const plano = (
      user as unknown as { toObject: () => Record<string, any> }
    ).toObject();
    return this.buildSession(
      plano,
      await this.issueRefreshToken(String(user._id), userAgent, acting),
      acting,
    );
  }

  /** La sub-cuenta, si el usuario es administrador de la agencia dueña. */
  private async actingFor(
    user: { role?: string; tenantId?: { toString(): string } | null },
    acting?: Types.ObjectId | string | null,
  ): Promise<string | null> {
    const home = this.tenantOf(user);
    if (!acting || !home || user.role !== 'TENANT_ADMIN') return null;
    return (await this.tenantsService.isSubAccountOf(String(acting), home))
      ? String(acting)
      : null;
  }

  /**
   * Cambia de sub-cuenta sin volver a entrar (HU72). Volver a la propia
   * agencia es pasar su id. Emite una sesión nueva atada a esa sub-cuenta.
   */
  async switchTenant(userId: string, target: string, userAgent?: string) {
    const user = await this.usersService.findById(userId);
    if (!user || user.isActive === false)
      throw new UnauthorizedException('Tu cuenta ya no está activa');
    const home = this.tenantOf(user);
    if (!home || user.role !== 'TENANT_ADMIN')
      throw new ForbiddenException('Solo el administrador de la agencia');
    let acting: string | null = null;
    if (target !== home) {
      acting = await this.actingFor(user, target);
      if (!acting) throw new ForbiddenException('No administras esa cuenta');
    }
    if (!(await this.tenantsService.isActive(acting ?? home)))
      throw new UnauthorizedException(TENANT_SUSPENDED);
    const plano = (
      user as unknown as { toObject: () => Record<string, any> }
    ).toObject();
    return this.buildSession(
      plano,
      await this.issueRefreshToken(userId, userAgent, acting),
      acting,
    );
  }

  private tenantOf(user: {
    tenantId?: { toString(): string } | null;
  }): string | undefined {
    return user.tenantId ? user.tenantId.toString() : undefined;
  }

  /** Cierre de sesión: invalida el token de este dispositivo. */
  async revokeRefreshToken(token: string): Promise<void> {
    await this.refreshTokens.updateOne(
      { tokenHash: hashToken(token), revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  }

  /** Cierra todas las sesiones del usuario (cuenta desactivada, por ejemplo). */
  private async revokeAllFor(userId: string): Promise<void> {
    await this.refreshTokens.updateMany(
      { userId: new Types.ObjectId(userId), revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  }

  async login(user: Record<string, any>, userAgent?: string) {
    return this.buildSession(
      user,
      await this.issueRefreshToken(String(user['_id']), userAgent),
    );
  }

  private buildSession(
    user: Record<string, any>,
    refreshToken: string,
    acting?: string | null,
  ) {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    const home =
      (user['tenantId'] as { toString: () => string } | null)?.toString() ??
      null;
    const payload = {
      sub: user['_id'],
      email: user['email'],
      role: user['role'],
      tenantId: acting ?? home,
      ...(acting ? { homeTenantId: home } : {}),
      localIds: ((user['localIds'] as unknown[]) ?? []).map((id) => String(id)),
      mustChangePassword: !!user['mustChangePassword'],
      // `iat` va en segundos: con esto una revocación en el mismo segundo que
      // el login también invalida el token (ver ActiveUserCache.check).
      iatMs: Date.now(),
    };
    const result = {
      access_token: this.jwtService.sign(payload),
      refresh_token: refreshToken,
      user: {
        id: user['_id'],
        email: user['email'],
        name: user['name'],
        role: user['role'],
        tenantId: acting ?? user['tenantId'],
        ...(acting ? { homeTenantId: home } : {}),
        mustChangePassword: !!user['mustChangePassword'],
        referralCode: user['referralCode'] ?? null,
      },
    };
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */
    return result;
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const updatedUser = await this.usersService.changePassword(
      userId,
      currentPassword,
      newPassword,
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    return this.login((updatedUser as any).toObject());
  }

  private async sendVerificationCode(user: User): Promise<void> {
    const code = randomInt(100000, 1000000).toString();
    user.emailVerificationCodeHash = hashToken(code);
    user.emailVerificationExpires = new Date(Date.now() + EMAIL_CODE_TTL_MS);
    user.emailVerificationAttempts = 0;
    await user.save();
    await this.mailService.sendEmailVerificationEmail(user.email, code);
  }

  /** Canjea el código del correo por la primera sesión de la cuenta. */
  async verifyEmail(email: string, code: string, userAgent?: string) {
    const invalid = new BadRequestException(
      'El código es inválido o ha expirado',
    );
    const user = await this.usersService.findOneByEmailAnyStatus(email);
    if (
      !user ||
      user.emailVerified !== false ||
      !user.emailVerificationCodeHash ||
      !user.emailVerificationExpires ||
      user.emailVerificationExpires < new Date()
    )
      throw invalid;

    if (hashToken(code.trim()) !== user.emailVerificationCodeHash) {
      user.emailVerificationAttempts =
        (user.emailVerificationAttempts ?? 0) + 1;
      // Seis dígitos se adivinan a fuerza de intentos: con el tope, el código
      // muere antes y hay que pedir otro (que también tiene límite por IP).
      if (user.emailVerificationAttempts >= EMAIL_CODE_MAX_ATTEMPTS)
        user.emailVerificationCodeHash = undefined;
      await user.save();
      throw invalid;
    }

    user.emailVerified = true;
    user.emailVerificationCodeHash = undefined;
    user.emailVerificationExpires = undefined;
    user.emailVerificationAttempts = undefined;
    await user.save();
    this.logger.log(`Correo confirmado: ${user.email}`);

    const plano = (
      user as unknown as { toObject: () => Record<string, any> }
    ).toObject();
    // Cuentas pendientes de antes de HU87: no estrenan la prueba gratis al
    // confirmar; entran en solo lectura hasta que paguen un plan.
    if (user.tenantId)
      await this.tenantsService.endUnpaidTrial(String(user.tenantId));
    return this.login(plano, userAgent);
  }

  /** Respuesta idéntica exista o no la cuenta: no sirve para enumerar emails. */
  async resendVerification(email: string) {
    const user = await this.usersService.findOneByEmailAnyStatus(email);
    if (user && user.emailVerified === false)
      await this.sendVerificationCode(user);
    return { message: GENERIC_RESEND_MESSAGE };
  }

  async forgotPassword(email: string) {
    const user = await this.usersService.findOneByEmail(email);
    if (!user) {
      // Return success even if user doesn't exist to prevent email enumeration
      return { message: 'Si el correo existe, se ha enviado un código.' };
    }

    const code = randomInt(100000, 1000000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await this.usersService.saveResetCode(String(user._id), code, expires);
    await this.mailService.sendPasswordResetEmail(
      user.email,
      code,
      await this.tenantsService.mailBrandFor(this.tenantOf(user)),
    );

    return { message: 'Si el correo existe, se ha enviado un código.' };
  }

  async resetPassword(email: string, code: string, newPassword: string) {
    const user = await this.usersService.findOneByEmail(email);
    // Mensaje único para TODAS las ramas de fallo: igual que forgotPassword,
    // no se debe revelar si el email existe (anti-enumeración).
    const invalid = new BadRequestException(
      'El código es inválido o ha expirado',
    );
    if (
      !user ||
      !user.resetPasswordCode ||
      !user.resetPasswordExpires ||
      new Date() > user.resetPasswordExpires
    )
      throw invalid;
    if (hashResetCode(code) !== user.resetPasswordCode) {
      // Seis dígitos se adivinan a fuerza de intentos: con el tope, el código
      // muere antes y hay que pedir otro.
      await this.usersService.registerResetFailure(String(user._id));
      throw invalid;
    }

    await this.usersService.resetPassword(String(user._id), newPassword);
    // Quien tuviera la contraseña anterior (o una sesión abierta) queda fuera.
    await this.sessions.revoke(String(user._id), { refresh: true });
    return { message: 'Contraseña actualizada exitosamente' };
  }
}
