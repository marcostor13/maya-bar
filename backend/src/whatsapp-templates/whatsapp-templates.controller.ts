import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ModuleGuard } from '../roles/module.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  assertRole,
  CRM_ROLES,
  MANAGE_ROLES,
  type AuthReq,
} from '../auth/permissions';

/**
 * Consultar y refrescar el espejo de plantillas hace falta para armar una
 * campaña, y las campañas son de CRM_ROLES. Crear, editar y borrar plantillas
 * sigue reservado a MANAGE_ROLES.
 */
const TEMPLATE_ROLES = CRM_ROLES;
import { WhatsAppTemplatesService } from './whatsapp-templates.service';
import {
  CreateWaTemplateDto,
  UpdateWaTemplateDto,
} from './dto/wa-template.dto';

@Controller('whatsapp-templates')
@UseGuards(JwtAuthGuard, ModuleGuard('templates'))
export class WhatsAppTemplatesController {
  constructor(private service: WhatsAppTemplatesService) {}

  @Get()
  findAll(@Request() req: AuthReq, @Query('accountId') accountId?: string) {
    assertRole(req.user.role, TEMPLATE_ROLES);
    return this.service.findAll(req.user.tenantId, accountId);
  }

  /** Cuentas Cloud API del tenant, para el selector de la vista. */
  @Get('accounts')
  accounts(@Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.listAccounts(req.user.tenantId);
  }

  /** Sin `accountId` sincroniza la cuenta predeterminada del tenant. */
  @Post('sync')
  sync(@Request() req: AuthReq, @Query('accountId') accountId?: string) {
    assertRole(req.user.role, TEMPLATE_ROLES);
    return this.service.sync(req.user.tenantId, accountId);
  }

  @Post()
  create(@Body() dto: CreateWaTemplateDto, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.create(req.user.tenantId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWaTemplateDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.update(req.user.tenantId, id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.remove(req.user.tenantId, id);
  }
}
