import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthReq } from '../auth/permissions';
import {
  BILLING_PERIODS,
  CURRENCIES,
  PLAN_IDS,
  type BillingPeriod,
  type Currency,
  type PlanId,
} from '../billing/plans.catalog';
import { SubscriptionsAdminService } from './subscriptions-admin.service';

import { Audit } from '../audit/audit.decorator';
class ExtendTrialDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  days: number;
}

class ChangePlanDto {
  @IsIn(PLAN_IDS)
  plan: PlanId;

  /** Precio pactado por periodo, sin IGV. */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

class ManualPaymentDto {
  @IsIn(PLAN_IDS)
  plan: PlanId;

  @IsIn(BILLING_PERIODS)
  period: BillingPeriod;

  @IsIn(CURRENCIES)
  currency: Currency;

  /** Lo cobrado, con IGV en soles. */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(1_000_000)
  total: number;

  @IsIn(['transfer', 'yape', 'other'])
  method: 'transfer' | 'yape' | 'other';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9-]{8,64}$/)
  requestId?: string;
}

class RefundDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

class ResendReceiptDto {
  @IsOptional()
  @IsIn(['receipt', 'creditNote'])
  kind?: 'receipt' | 'creditNote';
}

/** Suscripciones e ingresos (HU57): solo el superadmin. */
@Controller('billing/admin/subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionsAdminController {
  constructor(private admin: SubscriptionsAdminService) {}

  private actor(req: AuthReq) {
    if (req.user.role !== 'SUPERADMIN') throw new ForbiddenException();
    return { userId: req.user.userId, email: req.user.email };
  }

  @Get('summary')
  summary(@Request() req: AuthReq) {
    this.actor(req);
    return this.admin.summary();
  }

  @Get()
  list(
    @Request() req: AuthReq,
    @Query('status') status?: string,
    @Query('plan') plan?: string,
    @Query('period') period?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
  ) {
    this.actor(req);
    return this.admin.list({
      status: status?.slice(0, 20),
      plan: plan?.slice(0, 20),
      period: period?.slice(0, 20),
      q: q?.slice(0, 100),
      page: Number(page) || 1,
    });
  }

  @Get(':tenantId')
  detail(@Request() req: AuthReq, @Param('tenantId') id: string) {
    this.actor(req);
    return this.admin.detail(id);
  }

  @Audit({
    action: 'admin.billing.trial_extended',
    resource: 'subscription',
    idParam: 'tenantId',
    tenantParam: 'tenantId',
    bodyFields: ['days'],
  })
  @Post(':tenantId/extend-trial')
  extendTrial(
    @Request() req: AuthReq,
    @Param('tenantId') id: string,
    @Body() dto: ExtendTrialDto,
  ) {
    return this.admin.extendTrial(this.actor(req), id, dto.days);
  }

  @Audit({
    action: 'admin.billing.plan_changed',
    resource: 'subscription',
    idParam: 'tenantId',
    tenantParam: 'tenantId',
    bodyFields: ['plan', 'period'],
  })
  @Post(':tenantId/change-plan')
  changePlan(
    @Request() req: AuthReq,
    @Param('tenantId') id: string,
    @Body() dto: ChangePlanDto,
  ) {
    return this.admin.changePlan(this.actor(req), id, dto);
  }

  @Audit({
    action: 'admin.billing.manual_payment',
    resource: 'payment',
    idParam: 'tenantId',
    tenantParam: 'tenantId',
    bodyFields: ['amount', 'method', 'months'],
  })
  @Post(':tenantId/manual-payment')
  manualPayment(
    @Request() req: AuthReq,
    @Param('tenantId') id: string,
    @Body() dto: ManualPaymentDto,
  ) {
    return this.admin.manualPayment(this.actor(req), id, dto);
  }

  @Audit({
    action: 'admin.billing.access_resent',
    resource: 'subscription',
    idParam: 'tenantId',
    tenantParam: 'tenantId',
  })
  @Post(':tenantId/resend-access')
  resendAccess(@Request() req: AuthReq, @Param('tenantId') id: string) {
    return this.admin.resendAccess(this.actor(req), id);
  }

  @Audit({
    action: 'admin.billing.refunded',
    resource: 'payment',
    idParam: 'paymentId',
  })
  @Post('payments/:paymentId/refund')
  refund(
    @Request() req: AuthReq,
    @Param('paymentId') id: string,
    @Body() dto: RefundDto,
  ) {
    return this.admin.refund(this.actor(req), id, dto.reason);
  }

  @Post('payments/:paymentId/resend-receipt')
  resendReceipt(
    @Request() req: AuthReq,
    @Param('paymentId') id: string,
    @Body() dto: ResendReceiptDto,
  ) {
    return this.admin.resendReceipt(this.actor(req), id, dto.kind ?? 'receipt');
  }
}
