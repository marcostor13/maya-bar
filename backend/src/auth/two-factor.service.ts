import { brandForTenant, MAYA_BRAND } from '../agency/white-label';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash, randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import { User, type TwoFactorState } from '../users/user.schema';
import { Tenant } from '../tenants/tenant.schema';
import { MailService } from '../mail/mail.service';
import { SecretBox } from '../shared/secret-box';
import {
  generateBackupCodes,
  generateSecret,
  hashBackupCode,
  otpauthUrl,
  verifyTotp,
} from './totp';

const CHALLENGE_TTL = '10m';
const DEVICE_TTL_DAYS = 30;
const EMAIL_CODE_TTL_MS = 10 * 60_000;
const MAX_EMAIL_ATTEMPTS = 5;

type Purpose = '2fa' | '2fa-setup';
interface ChallengePayload {
  sub: string;
  purpose: Purpose;
}

/** Respuesta del login cuando falta el segundo factor. */
export type TwoFactorChallenge =
  | {
      twoFactorRequired: true;
      method: 'totp' | 'email';
      challengeToken: string;
      emailHint?: string;
    }
  | {
      twoFactorSetupRequired: true;
      challengeToken: string;
      reason: 'tenant' | 'superadmin';
    };

export interface TwoFactorStatus {
  enabled: boolean;
  method: 'totp' | 'email' | null;
  backupCodesLeft: number;
  required: boolean;
  requiredBy: 'tenant' | 'superadmin' | null;
  tenantRequires: boolean;
}

const hashCode = (c: string) =>
  createHash('sha256').update(`2fa-mail:${c}`).digest('hex');
const sixDigits = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

/** Máscara del correo para la pantalla del código: `an***@dominio.pe`. */
function maskEmail(email: string) {
  const [u, d] = email.split('@');
  return `${u.slice(0, 2)}***@${d ?? ''}`;
}

/**
 * Doble factor de acceso (HU62): app de autenticación (TOTP) o código por
 * correo, 10 códigos de respaldo de un solo uso, obligatorio por empresa y
 * para el superadmin, y "recordar este dispositivo" 30 días.
 */
@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(TwoFactorService.name);
  private readonly box: SecretBox;

  constructor(
    @InjectModel(User.name) private users: Model<User>,
    @InjectModel(Tenant.name) private tenants: Model<Tenant>,
    private jwt: JwtService,
    private mail: MailService,
    private config: ConfigService,
  ) {
    this.box = new SecretBox(
      config.get<string>('EMAIL_ENCRYPTION_KEY') ||
        config.getOrThrow<string>('JWT_SECRET'),
    );
  }

  /** `SUPERADMIN_2FA=optional` lo desactiva (solo desarrollo y pruebas). */
  private get superadminRequired() {
    return (
      (this.config.get<string>('SUPERADMIN_2FA') || 'required') !== 'optional'
    );
  }

  // ── Login ──────────────────────────────────────────────────────────────

  /** `null` si puede entrar ya; si no, el reto que debe resolver. */
  async gate(
    user: Record<string, unknown>,
    deviceToken?: string,
  ): Promise<TwoFactorChallenge | null> {
    const id = String(user._id);
    const u = await this.users.findById(id).exec();
    if (!u) throw new UnauthorizedException('Invalid credentials');
    const tf = u.twoFactor;
    if (tf?.enabled) {
      if (deviceToken && this.validDevice(deviceToken, u)) return null;
      if (tf.method === 'email') await this.sendLoginEmailCode(u);
      return {
        twoFactorRequired: true,
        method: tf.method,
        challengeToken: this.challenge(id, '2fa'),
        ...(tf.method === 'email' ? { emailHint: maskEmail(u.email) } : {}),
      };
    }
    const req = await this.requirement(u);
    if (req)
      return {
        twoFactorSetupRequired: true,
        challengeToken: this.challenge(id, '2fa-setup'),
        reason: req,
      };
    return null;
  }

  /** Comprueba el código del reto y devuelve el usuario (y la marca del dispositivo). */
  async verifyChallenge(
    challengeToken: string,
    code: string,
    remember = false,
  ): Promise<{ user: User; deviceToken?: string; usedBackup: boolean }> {
    const { sub } = this.readChallenge(challengeToken, '2fa');
    const u = await this.users.findById(sub).exec();
    if (!u?.twoFactor?.enabled)
      throw new UnauthorizedException(
        'El acceso caducó. Vuelve a iniciar sesión.',
      );
    const usedBackup = await this.checkCode(u, code);
    const fresh = (await this.users.findById(sub).exec())!;
    return {
      user: fresh,
      usedBackup,
      deviceToken: remember ? this.deviceToken(fresh) : undefined,
    };
  }

  async resendLoginEmail(challengeToken: string) {
    const { sub, purpose } = this.readChallenge(challengeToken);
    const u = await this.users.findById(sub).exec();
    if (!u)
      throw new UnauthorizedException(
        'El acceso caducó. Vuelve a iniciar sesión.',
      );
    if (purpose === '2fa' && u.twoFactor?.method === 'email')
      await this.sendLoginEmailCode(u);
    else if (purpose === '2fa-setup' && u.twoFactorPending?.method === 'email')
      await this.startSetup(sub, 'email');
    else throw new BadRequestException('Este acceso no usa código por correo.');
    return { sent: true, emailHint: maskEmail(u.email) };
  }

  // ── Configuración ──────────────────────────────────────────────────────

  /** Usuario de un reto de configuración (login con 2FA obligatorio). */
  setupUserFromChallenge(challengeToken: string): string {
    return this.readChallenge(challengeToken, '2fa-setup').sub;
  }

  async startSetup(userId: string, method: 'totp' | 'email') {
    const u = await this.mustFind(userId);
    if (method === 'totp') {
      const secret = generateSecret();
      await this.users
        .updateOne(
          { _id: u._id },
          {
            $set: {
              twoFactorPending: {
                method,
                sealedSecret: this.box.encrypt(secret),
                createdAt: new Date(),
              },
            },
          },
        )
        .exec();
      return { method, secret, otpauthUrl: otpauthUrl(secret, u.email) };
    }
    const code = sixDigits();
    await this.users
      .updateOne(
        { _id: u._id },
        {
          $set: {
            twoFactorPending: {
              method,
              emailCodeHash: hashCode(code),
              emailCodeExpires: new Date(Date.now() + EMAIL_CODE_TTL_MS),
              attempts: 0,
              createdAt: new Date(),
            },
          },
        },
      )
      .exec();
    await this.mail.sendTwoFactorCodeEmail(
      u.email,
      code,
      u.tenantId
        ? await brandForTenant(this.tenants, String(u.tenantId)).then((b) =>
            b === MAYA_BRAND ? undefined : b,
          )
        : undefined,
    );
    return { method, emailHint: maskEmail(u.email) };
  }

  /** Confirma la configuración con un código y devuelve los códigos de respaldo (una sola vez). */
  async confirmSetup(
    userId: string,
    code: string,
  ): Promise<{ backupCodes: string[]; user: User }> {
    const u = await this.mustFind(userId);
    const p = u.twoFactorPending;
    if (!p) throw new BadRequestException('Empieza la configuración de nuevo.');
    if (p.method === 'totp') {
      const step = p.sealedSecret
        ? verifyTotp(this.box.decrypt(p.sealedSecret), code)
        : null;
      if (step === null)
        throw new BadRequestException(
          'El código no coincide. Revisa la hora del teléfono y prueba con el siguiente.',
        );
      const backupCodes = generateBackupCodes();
      await this.enable(
        u,
        { method: 'totp', sealedSecret: p.sealedSecret, lastStep: step },
        backupCodes,
      );
      return { backupCodes, user: await this.mustFind(userId) };
    }
    if (
      !p.emailCodeHash ||
      !p.emailCodeExpires ||
      p.emailCodeExpires < new Date() ||
      (p.attempts ?? 0) >= MAX_EMAIL_ATTEMPTS
    )
      throw new BadRequestException('El código caducó. Pide otro.');
    if (hashCode(String(code).trim()) !== p.emailCodeHash) {
      await this.users
        .updateOne({ _id: u._id }, { $inc: { 'twoFactorPending.attempts': 1 } })
        .exec();
      throw new BadRequestException('El código no es correcto.');
    }
    const backupCodes = generateBackupCodes();
    await this.enable(u, { method: 'email' }, backupCodes);
    return { backupCodes, user: await this.mustFind(userId) };
  }

  private async enable(
    u: User,
    s: Partial<TwoFactorState>,
    backupCodes: string[],
  ) {
    const state: TwoFactorState = {
      enabled: true,
      method: s.method!,
      ...(s.sealedSecret ? { sealedSecret: s.sealedSecret } : {}),
      ...(s.lastStep !== undefined ? { lastStep: s.lastStep } : {}),
      backupHashes: backupCodes.map(hashBackupCode),
      enabledAt: new Date(),
    };
    await this.users
      .updateOne(
        { _id: u._id },
        { $set: { twoFactor: state }, $unset: { twoFactorPending: '' } },
      )
      .exec();
    this.logger.log(`2FA activado (${state.method}) para ${String(u._id)}`);
  }

  async status(userId: string): Promise<TwoFactorStatus> {
    const u = await this.mustFind(userId);
    const req = await this.requirement(u);
    const tenantRequires = u.tenantId
      ? !!(
          await this.tenants
            .findById(u.tenantId)
            .select('require2fa')
            .lean()
            .exec()
        )?.require2fa
      : false;
    return {
      enabled: !!u.twoFactor?.enabled,
      method: u.twoFactor?.enabled ? u.twoFactor.method : null,
      backupCodesLeft: u.twoFactor?.backupHashes?.length ?? 0,
      required: !!req,
      requiredBy: req,
      tenantRequires,
    };
  }

  async regenerateBackupCodes(userId: string, password: string) {
    const u = await this.withPassword(userId, password);
    if (!u.twoFactor?.enabled)
      throw new BadRequestException('Activa primero el doble factor.');
    const backupCodes = generateBackupCodes();
    await this.users
      .updateOne(
        { _id: u._id },
        { $set: { 'twoFactor.backupHashes': backupCodes.map(hashBackupCode) } },
      )
      .exec();
    return { backupCodes };
  }

  async disable(userId: string, password: string) {
    const u = await this.withPassword(userId, password);
    const req = await this.requirement(u);
    if (req)
      throw new ForbiddenException(
        req === 'tenant'
          ? 'Tu empresa exige el doble factor: no se puede desactivar.'
          : 'El superadmin debe tener doble factor.',
      );
    await this.users
      .updateOne(
        { _id: u._id },
        { $unset: { twoFactor: '', twoFactorPending: '' } },
      )
      .exec();
    return { enabled: false };
  }

  /** Reinicio por el administrador de la empresa o el superadmin (pierde el teléfono). */
  async reset(
    actor: { userId: string; role: string; tenantId?: string | null },
    targetId: string,
  ) {
    if (!Types.ObjectId.isValid(targetId))
      throw new NotFoundException('Usuario no encontrado');
    const target = await this.users.findById(targetId).exec();
    if (!target) throw new NotFoundException('Usuario no encontrado');
    const sameTenant =
      !!actor.tenantId && String(target.tenantId) === String(actor.tenantId);
    if (
      actor.role !== 'SUPERADMIN' &&
      !(actor.role === 'TENANT_ADMIN' && sameTenant)
    )
      throw new NotFoundException('Usuario no encontrado');
    if (
      target.role === 'SUPERADMIN' &&
      actor.userId !== String(target._id) &&
      actor.role !== 'SUPERADMIN'
    )
      throw new ForbiddenException();
    await this.users
      .updateOne(
        { _id: target._id },
        { $unset: { twoFactor: '', twoFactorPending: '' } },
      )
      .exec();
    this.logger.warn(
      `2FA reiniciado para ${targetId} por ${actor.userId} (${actor.role})`,
    );
    return { reset: true };
  }

  async setTenantPolicy(tenantId: string, required: boolean) {
    await this.tenants
      .updateOne(
        { _id: new Types.ObjectId(tenantId) },
        { $set: { require2fa: required } },
      )
      .exec();
    return { required };
  }

  // ── Interno ────────────────────────────────────────────────────────────

  private async requirement(u: User): Promise<'tenant' | 'superadmin' | null> {
    if (u.role === 'SUPERADMIN')
      return this.superadminRequired ? 'superadmin' : null;
    if (!u.tenantId) return null;
    const t = await this.tenants
      .findById(u.tenantId)
      .select('require2fa')
      .lean()
      .exec();
    return t?.require2fa ? 'tenant' : null;
  }

  /** Usuario de un reto sin validarlo más allá de la firma (para la auditoría). */
  peekChallenge(token: string): string | null {
    try {
      return this.readChallenge(token).sub;
    } catch {
      return null;
    }
  }

  /** `true` si entró con un código de respaldo. */
  private async checkCode(u: User, raw: string): Promise<boolean> {
    const tf = u.twoFactor!;
    const code = String(raw ?? '').trim();
    // Código de respaldo: `xxxx-xxxx` (o sin guion). Se consume al usarlo.
    if (/[a-z]/i.test(code) || code.replace(/[^a-z0-9]/gi, '').length === 8) {
      const h = hashBackupCode(code);
      const res = await this.users
        .updateOne(
          { _id: u._id, 'twoFactor.backupHashes': h },
          { $pull: { 'twoFactor.backupHashes': h } },
        )
        .exec();
      if (res.modifiedCount === 1) {
        this.logger.warn(`Código de respaldo usado por ${String(u._id)}`);
        return true;
      }
      throw new UnauthorizedException('El código no es válido.');
    }
    if (tf.method === 'totp') {
      const step = tf.sealedSecret
        ? verifyTotp(this.box.decrypt(tf.sealedSecret), code)
        : null;
      if (step === null)
        throw new UnauthorizedException('El código no es válido.');
      // Anti-repetición: solo pasos posteriores al último usado.
      const res = await this.users
        .updateOne(
          {
            _id: u._id,
            $or: [
              { 'twoFactor.lastStep': { $exists: false } },
              { 'twoFactor.lastStep': { $lt: step } },
            ],
          },
          { $set: { 'twoFactor.lastStep': step } },
        )
        .exec();
      if (res.modifiedCount !== 1)
        throw new UnauthorizedException(
          'Ese código ya se usó. Espera el siguiente.',
        );
      return false;
    }
    if (
      !tf.emailCodeHash ||
      !tf.emailCodeExpires ||
      tf.emailCodeExpires < new Date() ||
      (tf.emailCodeAttempts ?? 0) >= MAX_EMAIL_ATTEMPTS
    )
      throw new UnauthorizedException('El código caducó. Pide otro.');
    if (hashCode(code) !== tf.emailCodeHash) {
      await this.users
        .updateOne(
          { _id: u._id },
          { $inc: { 'twoFactor.emailCodeAttempts': 1 } },
        )
        .exec();
      throw new UnauthorizedException('El código no es válido.');
    }
    await this.users
      .updateOne(
        { _id: u._id },
        {
          $unset: {
            'twoFactor.emailCodeHash': '',
            'twoFactor.emailCodeExpires': '',
            'twoFactor.emailCodeAttempts': '',
          },
        },
      )
      .exec();
    return false;
  }

  private async sendLoginEmailCode(u: User) {
    const code = sixDigits();
    await this.users
      .updateOne(
        { _id: u._id },
        {
          $set: {
            'twoFactor.emailCodeHash': hashCode(code),
            'twoFactor.emailCodeExpires': new Date(
              Date.now() + EMAIL_CODE_TTL_MS,
            ),
            'twoFactor.emailCodeAttempts': 0,
          },
        },
      )
      .exec();
    await this.mail.sendTwoFactorCodeEmail(
      u.email,
      code,
      u.tenantId
        ? await brandForTenant(this.tenants, String(u.tenantId)).then((b) =>
            b === MAYA_BRAND ? undefined : b,
          )
        : undefined,
    );
  }

  private challenge(sub: string, purpose: Purpose) {
    return this.jwt.sign({ sub, purpose } satisfies ChallengePayload, {
      expiresIn: CHALLENGE_TTL,
    });
  }

  private readChallenge(token: string, purpose?: Purpose): ChallengePayload {
    let p: ChallengePayload & { purpose?: string };
    try {
      p = this.jwt.verify<ChallengePayload>(token);
    } catch {
      throw new UnauthorizedException(
        'El acceso caducó. Vuelve a iniciar sesión.',
      );
    }
    if (
      !p?.sub ||
      (p.purpose !== '2fa' && p.purpose !== '2fa-setup') ||
      (purpose && p.purpose !== purpose)
    )
      throw new UnauthorizedException(
        'El acceso caducó. Vuelve a iniciar sesión.',
      );
    return p;
  }

  /** Marca firmada del dispositivo; deja de valer si se reinicia o reactiva el 2FA. */
  private deviceToken(u: User) {
    return this.jwt.sign(
      {
        sub: String(u._id),
        purpose: '2fa-device',
        v: u.twoFactor!.enabledAt.getTime(),
      },
      { expiresIn: `${DEVICE_TTL_DAYS}d` },
    );
  }

  private validDevice(token: string, u: User): boolean {
    try {
      const p = this.jwt.verify<{ sub: string; purpose: string; v: number }>(
        token,
      );
      return (
        p.purpose === '2fa-device' &&
        p.sub === String(u._id) &&
        p.v === new Date(u.twoFactor!.enabledAt).getTime()
      );
    } catch {
      return false;
    }
  }

  private async mustFind(userId: string) {
    const u = await this.users.findById(userId).exec();
    if (!u) throw new NotFoundException('Usuario no encontrado');
    return u;
  }

  private async withPassword(userId: string, password: string) {
    const u = await this.mustFind(userId);
    if (!password || !(await bcrypt.compare(password, u.password)))
      throw new UnauthorizedException('La contraseña no es correcta.');
    return u;
  }
}
