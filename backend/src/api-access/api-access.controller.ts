import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ModuleGuard } from '../roles/module.guard';
import type { AuthReq } from '../auth/permissions';
import { ApiAccessService } from './api-access.service';
import { CreateApiAccessDto, UpdateApiAccessDto } from './dto/api-access.dto';

/** Administración de los accesos de API de la empresa (módulo Integraciones). */
@Controller('api-access')
@UseGuards(JwtAuthGuard, ModuleGuard('integrations'))
export class ApiAccessController {
  constructor(private service: ApiAccessService) {}

  @Get()
  list(@Request() req: AuthReq) {
    return this.service.list(req.user.tenantId);
  }

  @Get('accounts')
  accounts(@Request() req: AuthReq) {
    return this.service.accounts(req.user.tenantId);
  }

  @Post()
  create(@Body() dto: CreateApiAccessDto, @Request() req: AuthReq) {
    return this.service.create(req.user.tenantId, req.user.userId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateApiAccessDto,
    @Request() req: AuthReq,
  ) {
    return this.service.update(req.user.tenantId, id, dto);
  }

  @Post(':id/regenerate')
  regenerate(@Param('id') id: string, @Request() req: AuthReq) {
    return this.service.regenerate(req.user.tenantId, id);
  }

  @Post(':id/revoke')
  revoke(@Param('id') id: string, @Request() req: AuthReq) {
    return this.service.revoke(req.user.tenantId, id);
  }
}
