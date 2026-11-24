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
  Optional,
} from '@nestjs/common';
import { RecoveryAnalysisService } from './recovery-analysis.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ModuleGuard } from '../roles/module.guard';
import {
  assertRole,
  CRM_ROLES,
  MANAGE_ROLES,
  type AuthReq,
} from '../auth/permissions';
import { RecoveryService } from './recovery.service';
import {
  CreateRecoveryPlanDto,
  RewriteMessageDto,
  ScheduleRecoveryDto,
  UpdateRecoveryPlanDto,
} from './dto/recovery.dto';

/**
 * Recuperación de clientes: un asistente sobre campañas. Comparte el módulo
 * de permisos `campaigns` porque lo que termina haciendo es enviar campañas.
 */
@Controller('recovery')
@UseGuards(JwtAuthGuard, ModuleGuard('campaigns'))
export class RecoveryController {
  constructor(
    private recovery: RecoveryService,
    // Global (HU42); opcional para las pruebas que montan solo el controlador.
    @Optional() private limits?: PlanLimitsService,
    @Optional() private analysis?: RecoveryAnalysisService,
  ) {}

  @Get()
  findAll(@Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.recovery.findAll(req.user.tenantId);
  }

  /** Campañas de origen de los chats de WhatsApp (va antes de `:id`). */
  @Get('campaigns')
  campaigns(@Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.recovery.campaigns(req.user.tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.recovery.findOne(id, req.user.tenantId);
  }

  @Post()
  async create(@Body() dto: CreateRecoveryPlanDto, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    await this.limits?.assertFeature(req.user.tenantId, 'recovery');
    await this.analysis?.assertCredits(req.user.tenantId);
    return this.recovery.create(req.user.tenantId, req.user.userId, dto);
  }

  @Post(':id/reanalyze')
  async reanalyze(
    @Param('id') id: string,
    @Body() dto: CreateRecoveryPlanDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    await this.analysis?.assertCredits(req.user.tenantId);
    return this.recovery.reanalyze(id, req.user.tenantId, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRecoveryPlanDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.recovery.update(id, req.user.tenantId, dto);
  }

  @Post(':id/segments/:key/rewrite')
  rewrite(
    @Param('id') id: string,
    @Param('key') key: string,
    @Body() dto: RewriteMessageDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.recovery.requestRewrite(
      id,
      req.user.tenantId,
      key,
      dto.instruction,
    );
  }

  @Post(':id/templates')
  submitTemplates(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.recovery.submitTemplates(id, req.user.tenantId);
  }

  @Post(':id/templates/refresh')
  refreshTemplates(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.recovery.refreshTemplates(id, req.user.tenantId);
  }

  @Put(':id/schedule')
  schedule(
    @Param('id') id: string,
    @Body() dto: ScheduleRecoveryDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
    return this.recovery.schedule(id, req.user.tenantId, dto);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.recovery.cancel(id, req.user.tenantId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, MANAGE_ROLES);
    return this.recovery.remove(id, req.user.tenantId);
  }
}
