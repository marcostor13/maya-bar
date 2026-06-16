import {
  Controller,
  Post,
  Patch,
  Body,
  Request,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { AuthReq } from './permissions';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  async login(@Body() body: { email: string; password: string }) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const user = await this.authService.validateUser(body.email, body.password);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    return this.authService.login(user);
  }

  @Post('register')
  async register(
    @Body()
    body: {
      name: string;
      ruc?: string;
      email: string;
      phone?: string;
      ownerName: string;
      ownerPassword: string;
    },
  ) {
    return this.authService.registerTenant(body);
  }

  @Patch('change-password')
  @UseGuards(JwtAuthGuard)
  changePassword(
    @Body() body: { currentPassword: string; newPassword: string },
    @Request() req: AuthReq,
  ) {
    return this.authService.changePassword(
      req.user.userId,
      body.currentPassword,
      body.newPassword,
    );
  }

  @Post('forgot-password')
  async forgotPassword(@Body() body: { email: string }) {
    return this.authService.forgotPassword(body.email);
  }

  @Post('reset-password')
  async resetPassword(
    @Body() body: { email: string; code: string; newPassword: string },
  ) {
    try {
      return await this.authService.resetPassword(
        body.email,
        body.code,
        body.newPassword,
      );
    } catch (err: any) {
      throw new UnauthorizedException(err.message);
    }
  }
}
