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
import { ModuleGuard } from '../roles/module.guard';
import {
  assertRole,
  CRM_ROLES,
  MANAGE_ROLES,
  type AuthReq,
} from '../auth/permissions';
import { ProspectingService } from './prospecting.service';
import {
  ConvertToCustomerDto,
  ConvertToLeadDto,
  CreateProspectDto,
  CreateSearchDto,
  GenerateMaterialDto,
  ResearchProspectsDto,
  UpdateProspectDto,
} from './dto/prospecting.dto';

/**
 * Prospección: buscar empresas, investigarlas, preparar material y pasarlas a
 * contactos y seguimiento. Comparte el permiso de `leads` porque su resultado
 * son oportunidades del embudo.
 */
@Controller('prospecting')
@UseGuards(JwtAuthGuard, ModuleGuard('leads'))
export class ProspectingController {
  constructor(private service: ProspectingService) {}

  @Get('integrations')
  integrations(@Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.integrations(req.user.tenantId);
  }

  @Get('searches')
  listSearches(@Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.listSearches(req.user.tenantId);
  }

  @Post('searches')
  createSearch(@Body() dto: CreateSearchDto, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.createSearch(req.user.tenantId, req.user.userId, dto);
  }

  @Get('searches/:id')
  findSearch(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.findSearch(id, req.user.tenantId);
  }

  @Post('searches/:id/retry')
  retrySearch(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.retrySearch(id, req.user.tenantId);
  }

  @Delete('searches/:id')
  removeSearch(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.service.removeSearch(id, req.user.tenantId);
  }

  @Get('prospects')
  listProspects(
    @Request() req: AuthReq,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('searchId') searchId?: string,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.listProspects(req.user.tenantId, {
      status,
      q,
      searchId,
    });
  }

  @Post('prospects')
  createProspect(@Body() dto: CreateProspectDto, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.createProspect(req.user.tenantId, req.user.userId, dto);
  }

  @Post('prospects/research')
  research(@Body() dto: ResearchProspectsDto, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.queueResearch(dto.ids, req.user.tenantId);
  }

  @Get('prospects/:id')
  findProspect(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.findProspect(id, req.user.tenantId);
  }

  @Patch('prospects/:id')
  updateProspect(
    @Param('id') id: string,
    @Body() dto: UpdateProspectDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.updateProspect(id, req.user.tenantId, dto);
  }

  @Delete('prospects/:id')
  removeProspect(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.removeProspect(id, req.user.tenantId);
  }

  @Post('prospects/:id/material')
  material(
    @Param('id') id: string,
    @Body() dto: GenerateMaterialDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.queueMaterial(id, req.user.tenantId, dto.instructions);
  }

  @Post('prospects/:id/customer')
  toCustomer(
    @Param('id') id: string,
    @Body() dto: ConvertToCustomerDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.toCustomer(
      id,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
      dto,
    );
  }

  @Post('prospects/:id/lead')
  toLead(
    @Param('id') id: string,
    @Body() dto: ConvertToLeadDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.service.toLead(
      id,
      req.user.tenantId,
      req.user.userId,
      req.user.role,
      dto,
    );
  }
}
