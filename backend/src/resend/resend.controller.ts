import {
  Body,
  Controller,
  Delete,
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
import { ResendService } from './resend.service';
import { SaveResendConfigDto, TestResendDto } from './dto/resend.dto';

/** Cuenta de Resend de la empresa: vive en Configuración y es de administradores. */
@Controller('resend')
@UseGuards(JwtAuthGuard, ModuleGuard('settings'))
export class ResendController {
  constructor(private resend: ResendService) {}

  @Get('config')
  getConfig(@Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.resend.getConfig(req.user.tenantId);
  }

  @Put('config')
  saveConfig(@Body() dto: SaveResendConfigDto, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.resend.saveConfig(req.user.tenantId, dto);
  }

  @Post('test')
  @HttpCode(200)
  test(@Body() dto: TestResendDto, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.resend.test(req.user.tenantId, dto.to);
  }

  @Delete('config')
  remove(@Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.resend.remove(req.user.tenantId);
  }
}

/** Lo que necesita quien arma campañas: saber con qué remitente saldrán. */
@Controller('resend-status')
@UseGuards(JwtAuthGuard, ModuleGuard('campaigns'))
export class ResendStatusController {
  constructor(private resend: ResendService) {}

  @Get()
  status(@Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.resend.status(req.user.tenantId);
  }
}
