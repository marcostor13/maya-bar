import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  assertRole,
  CRM_ROLES,
  MANAGE_ROLES,
  type AuthReq,
} from '../auth/permissions';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto, UpdateCampaignDto } from './dto/campaign.dto';

@Controller('campaigns')
@UseGuards(JwtAuthGuard)
export class CampaignsController {
  constructor(private campaignsService: CampaignsService) {}

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

  @Post('generate-email')
  generateEmail(
    @Body() dto: { topic: string; tone?: string },
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.campaignsService.generateEmail(dto);
  }

  @Post()
  create(@Body() dto: CreateCampaignDto, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
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
