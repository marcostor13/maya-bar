import {
  Controller,
  Post,
  Patch,
  Body,
  Headers,
  Request,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { AuthReq } from './permissions';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterTenantDto,
  ResetPasswordDto,
  RefreshTokenDto,
} from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
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
  async register(@Body() body: RegisterTenantDto) {
    return this.authService.registerTenant(body);
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
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.forgotPassword(body.email);
  }

  @Post('reset-password')
  async resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(
      body.email,
      body.code,
      body.newPassword,
    );
  }
}
