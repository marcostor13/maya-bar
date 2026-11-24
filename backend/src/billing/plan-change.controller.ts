import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthReq } from '../auth/permissions';
import { PlanChangeService } from './plan-change.service';
import type { PlanId } from './plans.catalog';

import { Audit } from '../audit/audit.decorator';
class ChangePlanDto {
  @IsIn(['inicia', 'crece', 'escala'])
  plan: PlanId;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keepUserIds?: string[];
}

class CancelPlanDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** Cambio de plan y cancelación por el propio cliente (HU52). */
@Controller('billing/plan')
@UseGuards(JwtAuthGuard)
export class PlanChangeController {
  constructor(private plans: PlanChangeService) {}

  /** Solo el administrador de la empresa (no roles personalizados). */
  private admin(req: AuthReq) {
    if (req.user.role !== 'TENANT_ADMIN' || !req.user.tenantId)
      throw new ForbiddenException(
        'Solo el administrador puede cambiar el plan',
      );
    return req.user.tenantId;
  }

  @Get('options')
  options(@Request() req: AuthReq) {
    return this.plans.options(this.admin(req));
  }

  @Audit({
    action: 'billing.plan_upgrade',
    resource: 'subscription',
    bodyFields: ['plan', 'period'],
  })
  @Post('upgrade')
  upgrade(@Request() req: AuthReq, @Body() dto: ChangePlanDto) {
    return this.plans.upgrade(this.admin(req), req.user.userId, dto.plan);
  }

  @Audit({
    action: 'billing.plan_downgrade',
    resource: 'subscription',
    bodyFields: ['plan'],
  })
  @Post('downgrade')
  downgrade(@Request() req: AuthReq, @Body() dto: ChangePlanDto) {
    return this.plans.downgrade(this.admin(req), dto.plan, dto.keepUserIds);
  }

  @Audit({ action: 'billing.downgrade_cancelled', resource: 'subscription' })
  @Delete('downgrade')
  cancelDowngrade(@Request() req: AuthReq) {
    return this.plans.cancelDowngrade(this.admin(req));
  }

  @Audit({ action: 'billing.cancelled', resource: 'subscription' })
  @Post('cancel')
  cancel(@Request() req: AuthReq, @Body() dto: CancelPlanDto) {
    return this.plans.cancel(this.admin(req), dto.reason);
  }

  @Audit({ action: 'billing.reactivated', resource: 'subscription' })
  @Post('reactivate')
  reactivate(@Request() req: AuthReq) {
    return this.plans.reactivate(this.admin(req));
  }
}
