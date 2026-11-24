import {
  BadRequestException,
  ForbiddenException,
  Param,
  Post,
  Body,
  Controller,
  Get,
  Patch,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ADMIN_ONLY, assertRole } from '../auth/permissions';
import { Tenant } from '../tenants/tenant.schema';
import { PlanLimitsService } from './plan-limits.service';
import { Payment } from './payment.schema';
import { BillingInfoDto, docNumberError } from './dto/billing-info.dto';
import { LIMIT_KEYS } from './plans.catalog';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthReq } from '../auth/permissions';
import { BillingAccessService } from './billing-access.service';
import { AiCreditsService } from './ai-credits.service';
import { InvoicingService } from './invoicing/invoicing.service';
import { BillingMailer } from './emails/billing-mailer.service';
import { CouponsService } from './coupons/coupons.service';
import { CouponDto, UpdateCouponDto } from './coupons/coupon.dto';
import { PLANS, isPlanId } from './plans.catalog';

/** Estado de cobro de la propia empresa (banner de prueba, HU41; Mi plan, HU44). */
@Controller('billing')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(
    private access: BillingAccessService,
    private credits: AiCreditsService,
    private limits: PlanLimitsService,
    private invoicing: InvoicingService,
    private mailer: BillingMailer,
    private coupons: CouponsService,
    @InjectModel(Payment.name) private payments: Model<Payment>,
    @InjectModel(Tenant.name) private tenants: Model<Tenant>,
  ) {}

  private adminTenant(req: AuthReq): string {
    assertRole(req.user.role, ADMIN_ONLY);
    if (!req.user.tenantId) throw new BadRequestException('Sin empresa');
    return req.user.tenantId;
  }

  /** Consumo y costo de IA por empresa en el mes `AAAA-MM` (solo SUPERADMIN). */
  @Get('admin/ai-usage')
  aiUsageByTenant(@Request() req: AuthReq, @Query('period') period?: string) {
    this.superadmin(req);
    if (period && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period))
      throw new BadRequestException('Periodo AAAA-MM no válido');
    return this.credits.usageByTenant(period);
  }

  /** Costo real de IA por acción y por unidad en el mes (HU66, solo SUPERADMIN). */
  @Get('admin/ai-usage/by-action')
  aiUsageByAction(@Request() req: AuthReq, @Query('period') period?: string) {
    this.superadmin(req);
    if (period && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period))
      throw new BadRequestException('Periodo AAAA-MM no válido');
    return this.credits.usageByAction(period);
  }

  /** Solo el superadmin de verdad (assertRole deja pasar roles propios). */
  private superadmin(req: AuthReq) {
    if (req.user.role !== 'SUPERADMIN') throw new ForbiddenException();
  }

  /** Cola de comprobantes SUNAT fallidos o pendientes (HU49 §6). */
  @Get('admin/receipts')
  receiptQueue(@Request() req: AuthReq, @Query('status') status?: string) {
    this.superadmin(req);
    return this.invoicing.queue(status === 'pending' ? 'pending' : 'failed');
  }

  @Post('admin/receipts/:paymentId/retry')
  async retryReceipt(
    @Request() req: AuthReq,
    @Param('paymentId') paymentId: string,
  ) {
    this.superadmin(req);
    await this.invoicing.retry(paymentId);
    return { ok: true };
  }

  /** Bitácora de correos de cobro (HU50) y reenvío desde superadmin. */
  @Get('admin/emails')
  emailLog(@Request() req: AuthReq, @Query('tenantId') tenantId?: string) {
    this.superadmin(req);
    return this.mailer.list(tenantId);
  }

  @Post('admin/emails/:id/resend')
  async resendEmail(@Request() req: AuthReq, @Param('id') id: string) {
    this.superadmin(req);
    await this.mailer.resend(id);
    return { ok: true };
  }

  /** Cupones (HU54); la pantalla llega con HU57. */
  @Get('admin/coupons')
  listCoupons(@Request() req: AuthReq) {
    this.superadmin(req);
    return this.coupons.list();
  }

  @Post('admin/coupons')
  createCoupon(@Request() req: AuthReq, @Body() dto: CouponDto) {
    this.superadmin(req);
    return this.coupons.create(dto);
  }

  @Patch('admin/coupons/:id')
  updateCoupon(
    @Request() req: AuthReq,
    @Param('id') id: string,
    @Body() dto: UpdateCouponDto,
  ) {
    this.superadmin(req);
    return this.coupons.update(id, dto);
  }

  /** Mi plan: límites efectivos y uso real de cada recurso (HU44 C1). */
  @Get('usage')
  async usage(@Request() req: AuthReq) {
    const tenantId = this.adminTenant(req);
    const eff = await this.limits.effective(tenantId);
    const credits = await this.credits.balance(tenantId);
    const resources = await Promise.all(
      LIMIT_KEYS.filter((k) => k !== 'aiCreditsPerMonth').map(async (key) => ({
        key,
        limit: eff.unlimited ? null : eff.limits[key],
        used: await this.limits.usage(tenantId, key),
      })),
    );
    return { unlimited: eff.unlimited, resources, credits };
  }

  /** Historial de pagos con su comprobante (HU44 C2). */
  @Get('payments')
  async paymentHistory(@Request() req: AuthReq) {
    const tenantId = this.adminTenant(req);
    return this.payments
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ paidAt: -1 })
      .limit(100)
      .select(
        // Solo lo que le sirve al cliente; nada de la cola interna (H6).
        'concept amount currency status paidAt receipt.type receipt.series receipt.number receipt.pdfUrl receipt.xmlUrl receipt.status receipt.creditNote.series receipt.creditNote.number receipt.creditNote.pdfUrl receipt.creditNote.xmlUrl',
      )
      .lean()
      .exec();
  }

  @Get('info')
  async billingInfo(@Request() req: AuthReq) {
    const tenantId = this.adminTenant(req);
    const t = await this.tenants
      .findById(tenantId)
      .select('billingInfo')
      .lean()
      .exec();
    return t?.billingInfo ?? null;
  }

  @Put('info')
  async saveBillingInfo(@Request() req: AuthReq, @Body() dto: BillingInfoDto) {
    const tenantId = this.adminTenant(req);
    const error = docNumberError(dto);
    if (error) throw new BadRequestException(error);
    const billingInfo = {
      docType: dto.docType,
      docNumber: dto.docNumber,
      legalName: dto.legalName.trim(),
      address: dto.address?.trim() || undefined,
      email: dto.email?.trim().toLowerCase() || undefined,
    };
    await this.tenants
      .updateOne({ _id: tenantId }, { $set: { billingInfo } })
      .exec();
    return billingInfo;
  }

  /** Saldo de créditos de IA del mes (HU43, HU44). */
  @Get('credits')
  creditBalance(@Request() req: AuthReq) {
    if (!req.user.tenantId) return null;
    return this.credits.balance(req.user.tenantId);
  }

  @Get('status')
  async status(@Request() req: AuthReq) {
    const tenantId = req.user.tenantId;
    if (!tenantId) return { status: 'legacy', readOnly: false };
    const snap = await this.access.snapshot(tenantId);
    const state = await this.access.access(tenantId);
    const plan = isPlanId(snap?.plan) ? snap.plan : 'inicia';
    return {
      plan,
      planName: PLANS[plan].name,
      legacy: !!snap?.legacy,
      ...state,
      subscription: snap?.subscription
        ? {
            period: snap.subscription.period,
            currency: snap.subscription.currency,
            amount: snap.subscription.amount,
            currentPeriodEnd: snap.subscription.currentPeriodEnd,
            cancelAtPeriodEnd: !!snap.subscription.cancelAtPeriodEnd,
            pendingPlan: snap.subscription.pendingPlan,
            graceEndsAt: snap.subscription.graceEndsAt,
          }
        : undefined,
    };
  }
}
