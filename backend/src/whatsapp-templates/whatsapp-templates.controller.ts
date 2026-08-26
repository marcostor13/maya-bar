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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { assertRole, MANAGE_ROLES, type AuthReq } from '../auth/permissions';
import { WhatsAppTemplatesService } from './whatsapp-templates.service';
import {
  CreateWaTemplateDto,
  UpdateWaTemplateDto,
} from './dto/wa-template.dto';

@Controller('whatsapp-templates')
@UseGuards(JwtAuthGuard)
export class WhatsAppTemplatesController {
  constructor(private service: WhatsAppTemplatesService) {}

  @Get()
  findAll(@Request() req: AuthReq, @Query('accountId') accountId?: string) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.findAll(req.user.tenantId, accountId);
  }

  /** Cuentas Cloud API del tenant, para el selector de la vista. */
  @Get('accounts')
  accounts(@Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.listAccounts(req.user.tenantId);
  }

  @Post('sync')
  sync(@Request() req: AuthReq, @Query('accountId') accountId: string) {
    assertRole(req.user.role, MANAGE_ROLES);
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
