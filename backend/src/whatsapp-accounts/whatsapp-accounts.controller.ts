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
