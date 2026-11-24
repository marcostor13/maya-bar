import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Ip,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TwoFactorService } from './two-factor.service';
import type { AuthReq } from './permissions';
import {
  TwoFactorChallengeDto,
  TwoFactorPasswordDto,
  TwoFactorPolicyDto,
  TwoFactorSetupConfirmDto,
  TwoFactorSetupStartDto,
  TwoFactorVerifyDto,
} from './dto/auth.dto';

import { Audit } from '../audit/audit.decorator';
import { AuditService } from '../audit/audit.service';
const MINUTE = 60_000;
const plain = (u: unknown) =>
  (u as { toObject(): Record<string, unknown> }).toObject();

/** Doble factor de acceso (HU62). */
@Controller('auth/2fa')
@UseGuards(ThrottlerGuard)
export class TwoFactorController {
  constructor(
    private auth: AuthService,
    private twoFactor: TwoFactorService,
    private audit: AuditService,
  ) {}

  // ── Durante el login (sin sesión, con el reto) ─────────────────────────

  @Post('verify')
  @Throttle({ default: { limit: 10, ttl: 15 * MINUTE } })
  async verify(
    @Body() body: TwoFactorVerifyDto,
    @Ip() ip: string,
    @Headers('user-agent') ua?: string,
  ) {
    let verified: Awaited<ReturnType<TwoFactorService['verifyChallenge']>>;
    try {
      verified = await this.twoFactor.verifyChallenge(
        body.challengeToken,
        body.code,
        body.rememberDevice,
      );
    } catch (err) {
      const userId = this.twoFactor.peekChallenge(body.challengeToken);
      if (userId) await this.audit.twoFactorFailed(userId, ip, ua);
      throw err;
    }
    const { user, deviceToken } = verified;
    await this.audit.loginOk(
      plain(user),
      ip,
      ua,
      verified.usedBackup ? 'backup_code' : '2fa',
    );
    const session = await this.auth.login(plain(user), ua);
    return { ...session, ...(deviceToken ? { deviceToken } : {}) };
  }

  @Post('resend')
  @Throttle({ default: { limit: 3, ttl: 15 * MINUTE } })
  resend(@Body() body: TwoFactorChallengeDto) {
    return this.twoFactor.resendLoginEmail(body.challengeToken);
  }

  /** Configuración obligatoria antes de entrar (empresa que lo exige o superadmin). */
  @Post('enroll/start')
  @Throttle({ default: { limit: 10, ttl: 15 * MINUTE } })
  enrollStart(@Body() body: TwoFactorSetupStartDto) {
    return this.twoFactor.startSetup(
      this.twoFactor.setupUserFromChallenge(body.challengeToken ?? ''),
      body.method,
    );
  }

  @Post('enroll/confirm')
  @Throttle({ default: { limit: 10, ttl: 15 * MINUTE } })
  async enrollConfirm(
    @Body() body: TwoFactorSetupConfirmDto,
    @Ip() ip: string,
    @Headers('user-agent') ua?: string,
  ) {
    const userId = this.twoFactor.setupUserFromChallenge(
      body.challengeToken ?? '',
    );
    const { backupCodes, user } = await this.twoFactor.confirmSetup(
      userId,
      body.code,
    );
    await this.audit.loginOk(plain(user), ip, ua, '2fa_enrolled');
    return { ...(await this.auth.login(plain(user), ua)), backupCodes };
  }

  // ── Con sesión (Mi cuenta) ─────────────────────────────────────────────

  @Get('status')
  @UseGuards(JwtAuthGuard)
  status(@Request() req: AuthReq) {
    return this.twoFactor.status(req.user.userId);
  }

  @Post('setup')
  @UseGuards(JwtAuthGuard)
  setup(@Body() body: TwoFactorSetupStartDto, @Request() req: AuthReq) {
    return this.twoFactor.startSetup(req.user.userId, body.method);
  }

  @Audit({ action: 'auth.2fa_enabled', resource: 'user' })
  @Post('setup/confirm')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 15 * MINUTE } })
  async setupConfirm(
    @Body() body: TwoFactorSetupConfirmDto,
    @Request() req: AuthReq,
  ) {
    const { backupCodes } = await this.twoFactor.confirmSetup(
      req.user.userId,
      body.code,
    );
    return { backupCodes };
  }

  @Audit({ action: 'auth.2fa_backup_regenerated', resource: 'user' })
  @Post('backup-codes')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 15 * MINUTE } })
  regenerate(@Body() body: TwoFactorPasswordDto, @Request() req: AuthReq) {
    return this.twoFactor.regenerateBackupCodes(req.user.userId, body.password);
  }

  @Audit({ action: 'auth.2fa_disabled', resource: 'user' })
  @Post('disable')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 15 * MINUTE } })
  disable(@Body() body: TwoFactorPasswordDto, @Request() req: AuthReq) {
    return this.twoFactor.disable(req.user.userId, body.password);
  }

  /** El administrador de la empresa o el superadmin reinician el 2FA de alguien que perdió el teléfono. */
  @Audit({ action: 'auth.2fa_reset', resource: 'user', idParam: 'userId' })
  @Post('reset/:userId')
  @UseGuards(JwtAuthGuard)
  reset(@Param('userId') userId: string, @Request() req: AuthReq) {
    if (req.user.role !== 'TENANT_ADMIN' && req.user.role !== 'SUPERADMIN')
      throw new ForbiddenException();
    return this.twoFactor.reset(req.user, userId);
  }

  @Audit({
    action: 'auth.2fa_policy',
    resource: 'tenant',
    bodyFields: ['required'],
  })
  @Put('policy')
  @UseGuards(JwtAuthGuard)
  policy(@Body() body: TwoFactorPolicyDto, @Request() req: AuthReq) {
    if (req.user.role !== 'TENANT_ADMIN' || !req.user.tenantId)
      throw new ForbiddenException();
    return this.twoFactor.setTenantPolicy(req.user.tenantId, body.required);
  }
}
