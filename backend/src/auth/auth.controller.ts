import {
  Controller,
  Post,
  Patch,
  Body,
  Headers,
  Ip,
  Request,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { TurnstileService } from './turnstile.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { AuthReq } from './permissions';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterTenantDto,
  ResendVerificationDto,
  ResetPasswordDto,
  RefreshTokenDto,
  VerifyEmailDto,
  RedeemAccessDto,
  SwitchTenantDto,
} from './dto/auth.dto';
import { AccountProvisioningService } from './account-provisioning.service';
import { TwoFactorService } from './two-factor.service';
import { AuditService } from '../audit/audit.service';

const MINUTE = 60_000;

/**
 * Todas las rutas llevan límite por IP (ver ThrottlerModule en AuthModule).
 * Las que crean cuentas, mandan correos o aceptan códigos tienen el suyo, más
 * estricto: son las que un bot usa para dar de alta cuentas o adivinar códigos.
 */
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(
    private authService: AuthService,
    private turnstile: TurnstileService,
    private provisioning: AccountProvisioningService,
    private twoFactor: TwoFactorService,
    private audit: AuditService,
  ) {}

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  async login(
    @Body() body: LoginDto,
    @Ip() ip: string,
    @Headers('user-agent') ua?: string,
  ) {
    let user: Record<string, any> | null;
    try {
      user = await this.authService.validateUser(body.email, body.password);
    } catch (err) {
      // Cuenta desactivada, empresa suspendida o correo sin confirmar.
      await this.audit.loginFailed(body.email, 'blocked', ip, ua);
      throw err;
    }
    if (!user) {
      await this.audit.loginFailed(body.email, 'bad_credentials', ip, ua);
      throw new UnauthorizedException('Invalid credentials');
    }
    // Segundo factor (HU62): sin él no hay tokens, solo el reto.
    const challenge = await this.twoFactor.gate(user, body.deviceToken);
    if (challenge) return challenge;
    await this.audit.loginOk(user, ip, ua);
    return this.authService.login(user, ua);
  }

  /**
   * Renueva la sesión con el refresh token y lo rota. No lleva guard: el
   * access token puede estar ya caducado, que es justo cuando se llama.
   */
  @Post('refresh')
  async refresh(
    @Body() body: RefreshTokenDto,
    @Headers('user-agent') ua?: string,
  ) {
    return this.authService.refresh(body.refreshToken, ua);
  }

  /** Cierra la sesión de este dispositivo invalidando su refresh token. */
  @Post('logout')
  async logout(@Body() body: RefreshTokenDto) {
    await this.authService.revokeRefreshToken(body.refreshToken);
    return { ok: true };
  }

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60 * MINUTE } })
  async register(
    @Body() body: RegisterTenantDto,
    @Ip() ip: string,
    @Headers('user-agent') ua?: string,
  ) {
    await this.turnstile.assertHuman(body.captchaToken, ip);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { captchaToken: _token, acquisition, ...data } = body;
    return this.authService.registerTenant({
      ...data,
      ...(acquisition
        ? {
            acquisition: {
              ...acquisition,
              ip,
              userAgent: ua?.slice(0, 500),
              capturedAt: new Date(),
            },
          }
        : {}),
    });
  }

  @Post('verify-email')
  @Throttle({ default: { limit: 10, ttl: 15 * MINUTE } })
  async verifyEmail(
    @Body() body: VerifyEmailDto,
    @Headers('user-agent') ua?: string,
  ) {
    return this.authService.verifyEmail(body.email, body.code, ua);
  }

  @Post('resend-verification')
  @Throttle({ default: { limit: 3, ttl: 15 * MINUTE } })
  async resendVerification(@Body() body: ResendVerificationDto) {
    return this.authService.resendVerification(body.email);
  }

  /** Usuario de agencia: entra a una sub-cuenta o vuelve a la agencia (HU72). */
  @Post('switch-tenant')
  @UseGuards(JwtAuthGuard)
  switchTenant(
    @Body() body: SwitchTenantDto,
    @Request() req: AuthReq,
    @Headers('user-agent') ua?: string,
  ) {
    return this.authService.switchTenant(req.user.userId, body.tenantId, ua);
  }

  @Patch('change-password')
  @UseGuards(JwtAuthGuard)
  changePassword(@Body() body: ChangePasswordDto, @Request() req: AuthReq) {
    return this.authService.changePassword(
      req.user.userId,
      body.currentPassword,
      body.newPassword,
    );
  }

  @Post('forgot-password')
  @Throttle({ default: { limit: 5, ttl: 15 * MINUTE } })
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.forgotPassword(body.email);
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 10, ttl: 15 * MINUTE } })
  async resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(
      body.email,
      body.code,
      body.newPassword,
    );
  }

  /** Enlace de acceso tras pagar (HU47): crea la contraseña y abre sesión. */
  @Post('access')
  @Throttle({ default: { limit: 10, ttl: 15 * MINUTE } })
  async redeemAccess(
    @Body() body: RedeemAccessDto,
    @Headers('user-agent') ua?: string,
  ) {
    const user = await this.provisioning.redeem(
      body.email,
      body.token,
      body.password,
    );
    return this.authService.login(
      user.toObject() as Record<string, unknown>,
      ua,
    );
  }

  @Post('access/resend')
  @Throttle({ default: { limit: 3, ttl: 15 * MINUTE } })
  async resendAccess(@Body() body: ForgotPasswordDto) {
    await this.provisioning.resend(body.email);
    return {
      message:
        'Si tu cuenta está pendiente de activar, te enviamos un enlace nuevo.',
    };
  }
}
