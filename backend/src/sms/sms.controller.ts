import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ModuleGuard } from '../roles/module.guard';
import {
  assertRole,
  CRM_ROLES,
  MANAGE_ROLES,
  type AuthReq,
} from '../auth/permissions';
import { SmsService } from './sms.service';
import { SaveSmsConfigDto, TestSmsDto } from './dto/sms.dto';

/** Configuración del proveedor: vive en Configuración y es cosa de administradores. */
@Controller('sms')
@UseGuards(JwtAuthGuard, ModuleGuard('settings'))
export class SmsController {
  constructor(private sms: SmsService) {}

  @Get('config')
  getConfig(@Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.sms.getConfig(req.user.tenantId);
  }

  @Put('config')
  saveConfig(@Body() dto: SaveSmsConfigDto, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.sms.saveConfig(req.user.tenantId, dto);
  }

  @Post('test')
  @HttpCode(200)
  test(@Body() dto: TestSmsDto, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.sms.test(req.user.tenantId, dto.to, dto.message);
  }
}

/** Lo que necesita quien arma campañas: saber si hay proveedor, no sus datos. */
@Controller('sms-status')
@UseGuards(JwtAuthGuard, ModuleGuard('campaigns'))
export class SmsStatusController {
  constructor(private sms: SmsService) {}

  @Get()
  status(@Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.sms.status(req.user.tenantId);
  }
}
