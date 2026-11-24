import {
  Body,
  Controller,
  Delete,
  Get,
  Optional,
  Param,
  Patch,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ModuleGuard } from '../roles/module.guard';
import { assertRole, type AuthReq, type UserRole } from '../auth/permissions';
import { PlanLimitsService } from '../billing/plan-limits.service';
import {
  AutomationsService,
  type AutomationInput,
} from './automations.service';

/** Quién arma automatizaciones: envían en nombre de la empresa. */
const AUTOMATION_ROLES: UserRole[] = ['TENANT_ADMIN', 'MANAGER', 'MARKETING'];

class ActiveDto {
  @IsBoolean()
  active: boolean;
}

/**
 * Automatizaciones y secuencias (HU58). Comparten el módulo de permisos
 * `campaigns`: lo que hacen es enviar mensajes en nombre de la empresa.
 */
@Controller('automations')
@UseGuards(JwtAuthGuard, ModuleGuard('campaigns'))
export class AutomationsController {
  constructor(
    private automations: AutomationsService,
    @Optional() private limits?: PlanLimitsService,
  ) {}

  private async guard(req: AuthReq) {
    assertRole(req.user.role, AUTOMATION_ROLES);
    await this.limits?.assertFeature(req.user.tenantId, 'automations');
  }

  @Get()
  async list(@Request() req: AuthReq) {
    assertRole(req.user.role, AUTOMATION_ROLES);
    return this.automations.list(req.user.tenantId);
  }

  @Get('templates')
  templates(@Request() req: AuthReq) {
    assertRole(req.user.role, AUTOMATION_ROLES);
    return this.automations.templates();
  }

  @Get(':id')
  get(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, AUTOMATION_ROLES);
    return this.automations.get(req.user.tenantId, id);
  }

  // El cuerpo se valida a mano en el servicio: pasos con forma variable.
  @Post()
  async create(@Body() body: AutomationInput, @Request() req: AuthReq) {
    await this.guard(req);
    return this.automations.create(req.user.tenantId, req.user.userId, body);
  }

  @Post('templates/:key')
  async fromTemplate(@Param('key') key: string, @Request() req: AuthReq) {
    await this.guard(req);
    return this.automations.fromTemplate(
      req.user.tenantId,
      req.user.userId,
      key,
    );
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: AutomationInput,
    @Request() req: AuthReq,
  ) {
    await this.guard(req);
    return this.automations.update(req.user.tenantId, id, body);
  }

  @Patch(':id/active')
  async setActive(
    @Param('id') id: string,
    @Body() dto: ActiveDto,
    @Request() req: AuthReq,
  ) {
    if (dto.active) await this.guard(req);
    else assertRole(req.user.role, AUTOMATION_ROLES);
    return this.automations.setActive(req.user.tenantId, id, dto.active);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: AuthReq) {
    assertRole(req.user.role, AUTOMATION_ROLES);
    return this.automations.remove(req.user.tenantId, id);
  }

  @Post('runs/:runId/exit')
  exitRun(@Param('runId') runId: string, @Request() req: AuthReq) {
    assertRole(req.user.role, AUTOMATION_ROLES);
    return this.automations.exitRun(req.user.tenantId, runId);
  }
}
