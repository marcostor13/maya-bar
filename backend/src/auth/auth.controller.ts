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
} from './dto/auth.dto';

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
  ) {}

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  async login(@Body() body: LoginDto, @Headers('user-agent') ua?: string) {
    const user = await this.authService.validateUser(body.email, body.password);
    if (!user) throw new UnauthorizedException('Invalid credentials');
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
  async register(@Body() body: RegisterTenantDto, @Ip() ip: string) {
    await this.turnstile.assertHuman(body.captchaToken, ip);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { captchaToken: _token, ...data } = body;
    return this.authService.registerTenant(data);
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
}
