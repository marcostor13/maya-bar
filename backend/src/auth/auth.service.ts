import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash, randomBytes, randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
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
  ): Promise<string> {
    const token = randomBytes(48).toString('base64url');
    await this.refreshTokens.create({
      userId: new Types.ObjectId(userId),
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      userAgent,
    });
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

    registro.revokedAt = new Date();
    await registro.save();

    const plano = (
      user as unknown as { toObject: () => Record<string, any> }
    ).toObject();
    return this.buildSession(
      plano,
      await this.issueRefreshToken(String(user._id), userAgent),
    );
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

  private buildSession(user: Record<string, any>, refreshToken: string) {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    const payload = {
      sub: user['_id'],
      email: user['email'],
      role: user['role'],
      tenantId:
        (user['tenantId'] as { toString: () => string } | null)?.toString() ??
        null,
      localIds: ((user['localIds'] as unknown[]) ?? []).map((id) => String(id)),
      mustChangePassword: !!user['mustChangePassword'],
    };
    const result = {
      access_token: this.jwtService.sign(payload),
      refresh_token: refreshToken,
      user: {
        id: user['_id'],
        email: user['email'],
        name: user['name'],
        role: user['role'],
        tenantId: user['tenantId'],
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

  /**
   * Alta pública de una empresa. Con proveedor de correo, la cuenta nace sin
   * confirmar: no hay sesión hasta que se escribe el código enviado al correo,
   * así un bot no obtiene una cuenta usable con un email inventado. Sin
   * proveedor (desarrollo y pruebas) no hay forma de entregar el código y se
   * entra directo, como antes.
   */
  async registerTenant(data: {
    name: string;
    ruc?: string;
    email: string;
    phone?: string;
    ownerName: string;
    ownerPassword: string;
  }) {
    await this.discardPendingRegistration(data.email);
    const mustVerify = this.mailService.isConfigured;

    const tenant = await this.tenantsService.create({
      name: data.name,
      email: data.email,
      ruc: data.ruc,
      phone: data.phone,
    });

    const user = await this.usersService.create({
      email: data.email,
      password: data.ownerPassword,
      name: data.ownerName,
      role: 'TENANT_ADMIN',
      tenantId: tenant._id,
      ...(mustVerify ? { emailVerified: false } : {}),
    });

    if (mustVerify) {
      await this.sendVerificationCode(user);
      return { verificationRequired: true, email: user.email };
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    return this.login((user as any).toObject());
  }

  /**
   * Quien se registra y nunca confirma deja su email ocupado. Si vuelve a
   * registrarse con él, se descarta el intento anterior (empresa y usuario):
   * nunca pudo entrar, así que no tiene datos. Una cuenta confirmada o creada
   * por un administrador no se toca.
   */
  private async discardPendingRegistration(email: string): Promise<void> {
    const existing = await this.usersService.findOneByEmailAnyStatus(email);
    if (!existing || existing.emailVerified !== false || !existing.tenantId)
      return;
    await this.tenantsService.remove(String(existing.tenantId));
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

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await this.usersService.saveResetCode(String(user._id), code, expires);
    await this.mailService.sendPasswordResetEmail(user.email, code);

    return { message: 'Si el correo existe, se ha enviado un código.' };
  }

  async resetPassword(email: string, code: string, newPassword: string) {
    const user = await this.usersService.findOneByEmail(email);
    // Mensaje único para TODAS las ramas de fallo: igual que forgotPassword,
    // no se debe revelar si el email existe (anti-enumeración).
    if (
      !user ||
      !user.resetPasswordCode ||
      user.resetPasswordCode !== code ||
      !user.resetPasswordExpires ||
      new Date() > user.resetPasswordExpires
    ) {
      throw new BadRequestException('El código es inválido o ha expirado');
    }

    await this.usersService.resetPassword(String(user._id), newPassword);
    return { message: 'Contraseña actualizada exitosamente' };
  }
}
