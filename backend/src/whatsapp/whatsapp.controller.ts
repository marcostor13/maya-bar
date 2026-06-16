import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { assertRole, MANAGE_ROLES, type AuthReq } from '../auth/permissions';
import { SettingsService } from '../settings/settings.service';

@Controller('whatsapp')
@UseGuards(JwtAuthGuard)
export class WhatsAppController {
  constructor(private settings: SettingsService) {}

  @Get('status')
  status(@Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.settings.getWaStatus(req.user.tenantId);
  }

  @Get('qr')
  qr(@Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.settings.getWaQr(req.user.tenantId);
  }
}
