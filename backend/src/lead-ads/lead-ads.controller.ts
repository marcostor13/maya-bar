import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ModuleGuard } from '../roles/module.guard';
import { assertRole, MANAGE_ROLES, type AuthReq } from '../auth/permissions';
import { LeadAdsService } from './lead-ads.service';

/** Configuración de Meta Lead Ads (HU60): formularios, bitácora y reporte. */
@Controller('lead-ads')
@UseGuards(JwtAuthGuard, ModuleGuard('leads'))
export class LeadAdsController {
  constructor(private service: LeadAdsService) {}

  @Get('forms')
  forms(@Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.listForms(req.user.tenantId);
  }

  @Post('forms/sync')
  sync(@Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.syncForms(req.user.tenantId);
  }

  @Put('forms/:id')
  update(
    @Param('id') id: string,
    @Body()
    body: {
      mapping?: Record<string, string>;
      createLead?: boolean;
      active?: boolean;
    },
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.updateForm(req.user.tenantId, id, body ?? {});
  }

  @Get('leads')
  leads(@Request() req: AuthReq, @Query('limit') limit?: string) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.recent(req.user.tenantId, Number(limit) || 50);
  }

  @Post('leads/:id/retry')
  retry(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.retry(req.user.tenantId, id);
  }

  @Get('report')
  report(@Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.report(req.user.tenantId);
  }
}
