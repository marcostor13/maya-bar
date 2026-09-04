import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  assertRole,
  ADMIN_ONLY,
  MANAGE_ROLES,
  type AuthReq,
} from '../auth/permissions';
import { SettingsService } from './settings.service';
import { SaveSettingsDto } from './dto/settings.dto';

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private settings: SettingsService) {}

  @Get()
  get(@Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.settings.get(req.user.tenantId);
  }

  @Put()
  save(@Body() dto: SaveSettingsDto, @Request() req: AuthReq) {
    assertRole(req.user.role, ADMIN_ONLY);
    return this.settings.save(req.user.tenantId, dto);
  }

  @Get('whatsapp/status')
  waStatus(@Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.settings.getWaStatus(req.user.tenantId);
  }

  @Get('whatsapp/qr')
  waQr(@Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.settings.getWaQr(req.user.tenantId);
  }

  @Post('whatsapp/test')
  waTest(@Body() dto: { phone: string }, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    if (!dto.phone)
      throw new BadRequestException('Falta el número de teléfono');
    return this.settings.testWaha(req.user.tenantId, dto.phone);
  }
}
