import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ModuleGuard } from '../roles/module.guard';
import type { AuthReq } from '../auth/permissions';
import { ApiAccessService } from './api-access.service';
import {
  CreateApiAccessDto,
  SetWebhookDto,
  UpdateApiAccessDto,
} from './dto/api-access.dto';
import { ApiWebhookService } from './api-webhook.service';

/** Administración de los accesos de API de la empresa (módulo Integraciones). */
@Controller('api-access')
@UseGuards(JwtAuthGuard, ModuleGuard('integrations'))
export class ApiAccessController {
  constructor(
    private service: ApiAccessService,
    private webhooks: ApiWebhookService,
  ) {}

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

  // --- Webhook de salida (HU15) ---

  @Put(':id/webhook')
  setWebhook(
    @Param('id') id: string,
    @Body() dto: SetWebhookDto,
    @Request() req: AuthReq,
  ) {
    return this.webhooks.setUrl(req.user.tenantId, id, dto.url);
  }

  @Delete(':id/webhook')
  removeWebhook(@Param('id') id: string, @Request() req: AuthReq) {
    return this.webhooks.removeUrl(req.user.tenantId, id);
  }

  @Post(':id/webhook/rotate')
  rotateWebhook(@Param('id') id: string, @Request() req: AuthReq) {
    return this.webhooks.rotateSecret(req.user.tenantId, id);
  }

  @Post(':id/webhook/test')
  testWebhook(@Param('id') id: string, @Request() req: AuthReq) {
    return this.webhooks.sendTest(req.user.tenantId, id);
  }

  @Get(':id/webhook/deliveries')
  deliveries(@Param('id') id: string, @Request() req: AuthReq) {
    return this.webhooks.list(req.user.tenantId, id);
  }
}
