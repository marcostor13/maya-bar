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
  constructor(private recovery: RecoveryService) {}

  @Get()
  findAll(@Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.recovery.findAll(req.user.tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.recovery.findOne(id, req.user.tenantId);
  }

  @Post()
  create(@Body() dto: CreateRecoveryPlanDto, @Request() req: AuthReq) {
    assertRole(req.user.role, CRM_ROLES);
    return this.recovery.create(req.user.tenantId, req.user.userId, dto);
  }

  @Post(':id/reanalyze')
  reanalyze(
    @Param('id') id: string,
    @Body() dto: CreateRecoveryPlanDto,
    @Request() req: AuthReq,
  ) {
    assertRole(req.user.role, CRM_ROLES);
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
    return this.recovery.rewriteMessage(
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
