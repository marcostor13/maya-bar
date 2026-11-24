import {
  Controller,
  Get,
  HttpCode,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Optional,
} from '@nestjs/common';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { ModuleGuard } from '../roles/module.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  assertRole,
  CRM_ROLES,
  MANAGE_ROLES,
  type AuthReq,
} from '../auth/permissions';
import { CampaignsService } from './campaigns.service';
import { EmailTrackingService } from './email-tracking.service';
import {
  AudiencePreviewDto,
  CreateCampaignDto,
  UpdateCampaignDto,
} from './dto/campaign.dto';

@Controller('campaigns')
@UseGuards(JwtAuthGuard, ModuleGuard('campaigns'))
export class CampaignsController {
  constructor(
    private campaignsService: CampaignsService,
    // Global (HU42); opcional para las pruebas que montan solo el controlador.
    @Optional() private limits?: PlanLimitsService,
    @Optional() private tracking?: EmailTrackingService,
  ) {}

  /** Aperturas, clics, rebotes y bajas de una campaña de email (HU61). */
  @Get(':id/email-metrics')
  emailMetrics(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.tracking!.metrics(req.user.tenantId, id);
  }

  @Get()
  findAll(@Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.campaignsService.findAll(req.user.tenantId);
  }

  @Get(':id/estimate')
  estimate(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.campaignsService.estimate(id, req.user.tenantId);
  }

  @Get('preview')
  previewCount(@Query('tags') tags: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    const tagList = tags ? tags.split(',').filter(Boolean) : [];
    return this.campaignsService.previewCount(req.user.tenantId, tagList);
  }

  // Solo calcula: no crea nada.
  @Post('audience-preview')
  @HttpCode(200)
  audiencePreview(@Body() dto: AudiencePreviewDto, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.campaignsService.audiencePreview(req.user.tenantId, dto);
  }

  @Get(':id/recipients')
  recipients(
    @Param('id') id: string,
    @Query('status') status: string,
    @Query('page') page: string,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.campaignsService.recipients(id, req.user.tenantId, {
      status: status || undefined,
      page: Number(page) || 1,
    });
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.campaignsService.cancel(id, req.user.tenantId);
  }

  @Post('generate-email')
  generateEmail(
    @Body() dto: { topic: string; tone?: string },
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.campaignsService.generateEmail(dto, req.user.tenantId);
  }

  @Post()
  async create(@Body() dto: CreateCampaignDto, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    if (dto.type === 'whatsapp')
      await this.limits?.assertFeature(req.user.tenantId, 'whatsapp-campaigns');
    return this.campaignsService.create(req.user.tenantId, dto);
  }

  @Post(':id/send')
  send(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.campaignsService.send(id, req.user.tenantId);
  }

  @Post(':id/resend')
  resend(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.campaignsService.resend(id, req.user.tenantId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCampaignDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.campaignsService.update(id, req.user.tenantId, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.campaignsService.delete(id, req.user.tenantId);
  }
}
