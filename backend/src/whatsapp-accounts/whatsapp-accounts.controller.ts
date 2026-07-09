import {
  Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request, BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { assertRole, MANAGE_ROLES, type AuthReq } from '../auth/permissions';
import { WhatsAppAccountsService } from './whatsapp-accounts.service';
import { CreateWhatsAppAccountDto, UpdateWhatsAppAccountDto } from './dto/whatsapp-account.dto';

@Controller('whatsapp-accounts')
@UseGuards(JwtAuthGuard)
export class WhatsAppAccountsController {
  constructor(private service: WhatsAppAccountsService) {}

  @Get()
  findAll(@Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.findAll(req.user.tenantId);
  }

  /** Datos públicos (App ID + Configuration ID) para que el frontend abra el popup de Embedded Signup. */
  @Get('oauth/config')
  oauthConfig(@Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.getOAuthConfig();
  }

  @Post('oauth/connect')
  oauthConnect(@Body() dto: { code: string; wabaId: string; phoneNumberId: string }, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    if (!dto.code || !dto.wabaId || !dto.phoneNumberId) throw new BadRequestException('Faltan datos del Embedded Signup');
    return this.service.connectViaOAuth(req.user.tenantId, dto);
  }

  @Post(':id/oauth/refresh')
  refreshOAuthToken(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.refreshOAuthToken(id, req.user.tenantId);
  }

  @Post()
  create(@Body() dto: CreateWhatsAppAccountDto, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    if (!dto.label || !dto.provider) throw new BadRequestException('Faltan label o provider');
    return this.service.create(req.user.tenantId, dto);
  }

  @Get(':id/status')
  status(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.status(id, req.user.tenantId);
  }

  @Get(':id/qr')
  qr(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.qr(id, req.user.tenantId);
  }

  @Post(':id/test')
  test(@Param('id') id: string, @Body() dto: { phone: string }, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    if (!dto.phone) throw new BadRequestException('Falta el número de teléfono');
    return this.service.test(id, req.user.tenantId, dto.phone);
  }

  @Post(':id/webhook')
  configureWebhook(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.configureWebhook(id, req.user.tenantId);
  }

  @Patch(':id/default')
  setDefault(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.setDefault(id, req.user.tenantId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWhatsAppAccountDto, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.update(id, req.user.tenantId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.remove(id, req.user.tenantId);
  }
}
