import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
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
import { WaTemplatesService } from './wa-templates.service';
import { SaveSettingsDto } from './dto/settings.dto';
import { CreateWaTemplateDto } from './dto/wa-template.dto';

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(
    private settings: SettingsService,
    private templates: WaTemplatesService,
  ) {}

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

  // Templates
  @Get('templates')
  listTemplates(@Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.templates.findAll(req.user.tenantId);
  }

  @Post('templates/sync')
  syncTemplates(@Request() req: AuthReq) {
    assertRole(req.user.role, ADMIN_ONLY);
    return this.templates.sync(req.user.tenantId);
  }

  @Post('templates')
  createTemplate(@Body() dto: CreateWaTemplateDto, @Request() req: AuthReq) {
    assertRole(req.user.role, ADMIN_ONLY);
    return this.templates.create(req.user.tenantId, dto);
  }

  @Delete('templates/:id')
  deleteTemplate(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, ADMIN_ONLY);
    return this.templates.remove(req.user.tenantId, id);
  }
}
