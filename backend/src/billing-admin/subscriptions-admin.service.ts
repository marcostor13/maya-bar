import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type QueryFilter } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { Tenant } from '../tenants/tenant.schema';
import { TenantsService } from '../tenants/tenants.service';
import { Payment } from '../billing/payment.schema';
import { User } from '../users/user.schema';
import { OnboardingTask } from '../billing/onboarding/onboarding-task.schema';
import { MercadoPagoClient } from '../billing/mercadopago/mercadopago.client';
import { PaymentsService } from '../billing/payments.service';
import { InvoicingService } from '../billing/invoicing/invoicing.service';
import { BillingMailer } from '../billing/emails/billing-mailer.service';
import { BillingAccessService } from '../billing/billing-access.service';
import { PlanChangeService } from '../billing/plan-change.service';
import { AccountProvisioningService } from '../auth/account-provisioning.service';
import {
  IGV_RATE,
  PERIOD_MONTHS,
  PLANS,
  isPlanId,
  withIgv,
  type BillingPeriod,
  type Currency,
  type PlanId,
} from '../billing/plans.catalog';
import { AdminAction, type AdminActionType } from './admin-action.schema';
import { computeMrr } from './mrr';

export interface Actor {
  userId: string;
  email: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Suscripciones e ingresos para el superadmin (HU57): resumen, lista, detalle
 * y acciones. Cada acción deja quién la hizo en `billing_admin_actions`.
 */
@Injectable()
export class SubscriptionsAdminService {
  private readonly logger = new Logger(SubscriptionsAdminService.name);

  constructor(
    @InjectModel(Tenant.name) private tenants: Model<Tenant>,
    @InjectModel(Payment.name) private payments: Model<Payment>,
    @InjectModel(User.name) private users: Model<User>,
    @InjectModel(OnboardingTask.name) private tasks: Model<OnboardingTask>,
    @InjectModel(AdminAction.name) private actions: Model<AdminAction>,
    private tenantsService: TenantsService,
    private mp: MercadoPagoClient,
    private paymentsService: PaymentsService,
    private invoicing: InvoicingService,
    private mailer: BillingMailer,
    private access: BillingAccessService,
    private planChange: PlanChangeService,
    private provisioning: AccountProvisioningService,
  ) {}

  // ── Resumen ────────────────────────────────────────────────────────────

  async summary(now = new Date()) {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const subs = await this.tenants
      .find({}, { plan: 1, subscription: 1, trialEndsAt: 1, createdAt: 1 })
      .lean()
      .exec();
    const mrr = computeMrr(subs);
    const status = (t: (typeof subs)[number]) => t.subscription?.status;
    const graceOver = (t: (typeof subs)[number]) =>
      !!t.subscription?.graceEndsAt &&
      new Date(t.subscription.graceEndsAt) <= now;
    const active = subs.filter((t) => status(t) === 'active').length;
    // Impago vigente: la gracia aún no venció (vencida ya es baja).
    const pastDue = subs.filter(
      (t) => status(t) === 'past_due' && !graceOver(t),
    ).length;
    // Bajas del mes: canceladas de verdad (no las que piden cancelar al vencer)
    // y las que se cayeron por impago al vencer la gracia.
    const inMonth = (d?: Date | string) =>
      !!d && new Date(d) >= monthStart && new Date(d) <= now;
    const voluntary = subs.filter(
      (t) => status(t) === 'canceled' && inMonth(t.subscription?.canceledAt),
    ).length;
    const involuntary = subs.filter(
      (t) =>
        (status(t) === 'past_due' || status(t) === 'expired') &&
        graceOver(t) &&
        inMonth(t.subscription?.graceEndsAt),
    ).length;
    const canceledThisMonth = voluntary + involuntary;
    const cancelScheduled = subs.filter(
      (t) => status(t) === 'active' && !!t.subscription?.cancelAtPeriodEnd,
    ).length;
    // Base: las que pagaban al empezar el mes (siguen o se dieron de baja en él).
    const base = active + pastDue + canceledThisMonth;

    // Primer pago aprobado (no reembolsado) de cada empresa: los de este mes son clientes nuevos.
    const firsts = await this.payments
      .aggregate<{
        _id: Types.ObjectId;
        first: Date;
      }>([
        { $match: { status: 'approved', tenantId: { $exists: true } } },
        { $group: { _id: '$tenantId', first: { $min: '$paidAt' } } },
      ])
      .exec();
    const newThisMonth = firsts.filter((f) => f.first >= monthStart).length;

    const revenue = await this.payments
      .aggregate<{
        _id: Currency;
        total: number;
      }>([
        { $match: { status: 'approved', paidAt: { $gte: monthStart } } },
        { $group: { _id: '$currency', total: { $sum: '$amount' } } },
      ])
      .exec();
    const revenueThisMonth = { PEN: 0, USD: 0 };
    for (const r of revenue)
      revenueThisMonth[r._id === 'USD' ? 'USD' : 'PEN'] = round2(r.total);

    return {
      mrr: mrr.total,
      byPlan: mrr.byPlan.map((p) => ({
        ...p,
        planName: isPlanId(p.plan) ? PLANS[p.plan].name : p.plan,
      })),
      active,
      newThisMonth,
      canceledThisMonth,
      cancelScheduled,
      churnPct: base ? round2((canceledThisMonth / base) * 100) : 0,
      pastDue,
      revenueThisMonth,
    };
  }

  // ── Lista y detalle ────────────────────────────────────────────────────

  async list(f: {
    status?: string;
    plan?: string;
    period?: string;
    q?: string;
    page?: number;
  }) {
    const filter: Record<string, unknown> = {};
    if (f.status === 'trialing')
      filter.$or = [
        { 'subscription.status': 'trialing' },
        { subscription: { $exists: false }, trialEndsAt: { $exists: true } },
      ];
    else if (f.status) filter['subscription.status'] = f.status;
    if (f.plan) filter.plan = f.plan;
    if (f.period) filter['subscription.period'] = f.period;
    if (f.q?.trim()) {
      const rx = new RegExp(escapeRegex(f.q.trim()), 'i');
      filter.$and = [{ $or: [{ name: rx }, { email: rx }, { ruc: rx }] }];
    }
    const page = Math.max(1, f.page ?? 1);
    const size = 50;
    const [rows, total] = await Promise.all([
      this.tenants
        .find(filter as QueryFilter<Tenant>, {
          name: 1,
          email: 1,
          plan: 1,
          trialEndsAt: 1,
          subscription: 1,
          createdAt: 1,
        })
        .sort({ createdAt: -1 })
        .skip((page - 1) * size)
        .limit(size)
        .lean()
        .exec(),
      this.tenants.countDocuments(filter as QueryFilter<Tenant>).exec(),
    ]);
    return {
      total,
      page,
      pageSize: size,
      rows: rows.map((t) => ({
        _id: t._id,
        name: t.name,
        email: t.email,
        plan: t.plan,
        status:
          t.subscription?.status ?? (t.trialEndsAt ? 'trialing' : 'legacy'),
        period: t.subscription?.period,
        currency: t.subscription?.currency,
        amount: t.subscription?.amount,
        currentPeriodEnd: t.subscription?.currentPeriodEnd,
        trialEndsAt: t.trialEndsAt,
        cancelAtPeriodEnd: !!t.subscription?.cancelAtPeriodEnd,
        createdAt: (t as { createdAt?: Date }).createdAt,
      })),
    };
  }

  private async tenantOrThrow(id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Empresa no encontrada');
    const t = await this.tenants.findById(id).exec();
    if (!t) throw new NotFoundException('Empresa no encontrada');
    return t;
  }

  async detail(id: string) {
    const t = await this.tenantOrThrow(id);
    const [payments, onboarding, actions] = await Promise.all([
      this.payments
        .find({ tenantId: t._id })
        .sort({ paidAt: -1 })
        .limit(100)
        .lean()
        .exec(),
      this.tasks
        .find({ tenantId: t._id })
        .sort({ createdAt: -1 })
        .lean()
        .exec(),
      this.actions
        .find({ tenantId: t._id })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean()
        .exec(),
    ]);
    return {
      tenant: {
        _id: t._id,
        name: t.name,
        email: t.email,
        ruc: t.ruc,
        plan: t.plan,
        trialEndsAt: t.trialEndsAt,
        subscription: t.subscription ?? null,
        billingInfo: t.billingInfo,
        addonItems: t.addonItems,
      },
      payments: payments.map((p) => ({
        _id: p._id,
        concept: p.concept,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        provider: p.provider,
        paymentType: p.paymentType,
        paidAt: p.paidAt,
        kind: p.kind,
        receipt: p.receipt
          ? {
              status: p.receipt.status,
              code: p.receipt.series
                ? `${p.receipt.series}-${p.receipt.number}`
                : undefined,
              pdfUrl: p.receipt.pdfUrl,
              error: p.receipt.error,
              skippedReason: p.receipt.skippedReason,
              creditNote: p.receipt.creditNote
                ? {
                    status: p.receipt.creditNote.status,
                    code: p.receipt.creditNote.series
                      ? `${p.receipt.creditNote.series}-${p.receipt.creditNote.number}`
                      : undefined,
                    pdfUrl: p.receipt.creditNote.pdfUrl,
                    error: p.receipt.creditNote.error,
                  }
                : undefined,
            }
          : undefined,
      })),
      onboarding,
      actions,
    };
  }

  private async record(
    actor: Actor,
    tenantId: Types.ObjectId,
    action: AdminActionType,
    details?: Record<string, unknown>,
  ) {
    await this.actions
      .create({
        tenantId,
        actorId: new Types.ObjectId(actor.userId),
        actorEmail: actor.email,
        action,
        details,
      })
      .catch((e: unknown) =>
        this.logger.error(`No se registró la acción ${action}: ${String(e)}`),
      );
  }

  // ── Acciones ───────────────────────────────────────────────────────────

  /** Alargar la prueba (solo cuentas que nunca pagaron un plan). */
  /**
   * Cambiar el plan con precio especial: el precio pactado (sin IGV, por
   * periodo) reemplaza al de catálogo y al cupón; el periodo pagado no se mueve.
   */
  async changePlan(
    actor: Actor,
    id: string,
    p: { plan: PlanId; amount: number; reason?: string },
  ) {
    const t = await this.tenantOrThrow(id);
    const s = t.subscription;
    if (!s?.period || !(s.status === 'active' || s.status === 'past_due'))
      throw new BadRequestException(
        'La cuenta no tiene un plan pagado. Registra un pago manual para activarlo.',
      );
    if (!(p.amount > 0))
      throw new BadRequestException('Indica el precio pactado.');
    const amount = round2(p.amount);
    const auto = !!s.mpPreapprovalId && s.period === 'monthly';
    await this.tenants
      .updateOne(
        { _id: t._id },
        {
          $set: {
            plan: p.plan,
            legacy: false,
            'subscription.amount': amount,
            ...(auto
              ? {
                  'subscription.preapprovalAmountTarget':
                    s.currency === 'USD' ? amount : withIgv(amount),
                }
              : {}),
          },
          $unset: {
            'subscription.discount': '',
            'subscription.pendingPlan': '',
            'subscription.pendingPlanFrom': '',
          },
        },
      )
      .exec();
    this.access.invalidate(String(t._id));
    await this.planChange.settleUsers(t._id);
    if (auto)
      await this.planChange
        .syncPreapprovalAmounts()
        .catch((e: unknown) =>
          this.logger.warn(`Monto del preapproval pendiente: ${String(e)}`),
        );
    await this.record(actor, t._id, 'change_plan', {
      from: { plan: t.plan, amount: s.amount },
      to: { plan: p.plan, amount },
      reason: p.reason,
    });
    return { ok: true };
  }

  /**
   * Pago manual (transferencia o Yape directo): activa el plan por el periodo
   * pagado y deja el pago en cola para su comprobante (HU57 C2).
   */
  async manualPayment(
    actor: Actor,
    id: string,
    p: {
      plan: PlanId;
      period: BillingPeriod;
      currency: Currency;
      /** Lo que pagó el cliente, con IGV en soles. */
      total: number;
      method: 'transfer' | 'yape' | 'other';
      reference?: string;
      /** Clave de idempotencia que genera la pantalla al abrir el formulario. */
      requestId?: string;
    },
    now = new Date(),
  ) {
    const t = await this.tenantOrThrow(id);
    if (!(p.total > 0))
      throw new BadRequestException('Indica el monto pagado.');
    const providerPaymentId = `manual-${p.requestId ?? randomUUID()}`;
    // Doble clic o reintento con la misma clave: no se cobra ni se extiende dos veces.
    const existing = await this.payments
      .findOne({ providerPaymentId })
      .select('_id tenantId')
      .lean()
      .exec();
    if (existing) {
      if (String(existing.tenantId) !== String(t._id))
        throw new BadRequestException('Clave de pago repetida.');
      return { paymentId: existing._id, duplicate: true };
    }
    const total = round2(p.total);
    const base = p.currency === 'USD' ? total : round2(total / (1 + IGV_RATE));
    const payment = await this.payments.create({
      tenantId: t._id,
      concept: `Pago manual — Plan ${PLANS[p.plan].name}`,
      amount: total,
      currency: p.currency,
      status: 'approved',
      provider: 'manual',
      providerPaymentId,
      paidAt: now,
      kind: 'plan',
      paymentType: p.method,
      metadata: {
        plan: p.plan,
        period: p.period,
        method: p.method,
        reference: p.reference,
        by: actor.email,
      },
    });
    // La suscripción automática anterior deja de cobrar: este pago la reemplaza.
    const oldPre = t.subscription?.mpPreapprovalId;
    try {
      await this.tenantsService.activatePlan(
        t._id,
        { plan: p.plan, period: p.period, currency: p.currency, amount: base },
        now,
      );
    } catch (e) {
      // Sin plan activado no queda un pago aprobado suelto.
      await this.payments.deleteOne({ _id: payment._id }).exec();
      throw e;
    }
    // El superadmin eligió el plan pagado: se aplica ya, también si es menor
    // (activatePlan lo dejaría programado con el precio anterior).
    const after = await this.tenants
      .findOneAndUpdate(
        { _id: t._id },
        {
          $set: { plan: p.plan, 'subscription.amount': base },
          $unset: {
            'subscription.pendingPlan': '',
            'subscription.pendingPlanFrom': '',
            ...(oldPre ? { 'subscription.mpPreapprovalId': '' } : {}),
          },
          ...(oldPre
            ? { $addToSet: { 'subscription.preapprovalsToCancel': oldPre } }
            : {}),
        },
        { returnDocument: 'after' },
      )
      .lean()
      .exec();
    this.access.invalidate(String(t._id));
    // Periodo real del comprobante: en una renovación adelantada empieza al
    // vencer el anterior, no hoy.
    const end = after?.subscription?.currentPeriodEnd;
    if (end) {
      const from = new Date(end);
      from.setMonth(from.getMonth() - PERIOD_MONTHS[p.period]);
      await this.payments
        .updateOne(
          { _id: payment._id },
          { $set: { 'metadata.periodFrom': from.toISOString() } },
        )
        .exec();
      payment.metadata = {
        ...(payment.metadata ?? {}),
        periodFrom: from.toISOString(),
      };
    }
    await this.planChange.settleUsers(t._id);
    await this.invoicing.onPayment({
      payment,
      previousStatus: undefined,
      mp: {} as never,
    });
    await this.record(actor, t._id, 'manual_payment', {
      paymentId: String(payment._id),
      plan: p.plan,
      period: p.period,
      currency: p.currency,
      total,
      method: p.method,
      reference: p.reference,
    });
    return { paymentId: payment._id };
  }

  /** Reembolso total: Mercado Pago (o manual) y nota de crédito (HU57 C3). */
  async refund(actor: Actor, paymentId: string, reason?: string) {
    if (!Types.ObjectId.isValid(paymentId))
      throw new NotFoundException('Pago no encontrado');
    const pay = await this.payments.findById(paymentId).exec();
    if (!pay?.tenantId) throw new NotFoundException('Pago no encontrado');
    if (pay.status !== 'approved')
      throw new BadRequestException('Solo se reembolsa un pago aprobado.');
    // Candado: dos clics simultáneos no piden dos reembolsos.
    const lock = await this.payments
      .updateOne(
        {
          _id: pay._id,
          status: 'approved',
          refundRequestedAt: { $exists: false },
        },
        { $set: { refundRequestedAt: new Date() } },
      )
      .exec();
    if (lock.modifiedCount !== 1)
      throw new ConflictException(
        'El reembolso de este pago ya está en curso.',
      );
    let updated: Payment | null = pay;
    if (pay.provider === 'mercadopago') {
      if (!pay.providerPaymentId)
        throw new BadRequestException('El pago no tiene id de Mercado Pago.');
      try {
        await this.mp.refundPayment(pay.providerPaymentId);
      } catch (e) {
        await this.payments
          .updateOne({ _id: pay._id }, { $unset: { refundRequestedAt: '' } })
          .exec();
        throw new ServiceUnavailableException(
          `Mercado Pago no hizo el reembolso: ${(e as Error).message ?? String(e)}`,
        );
      }
      // El estado sale de la API: el webhook también lo traerá.
      const mp = await this.mp
        .getPayment(pay.providerPaymentId)
        .catch(() => null);
      if (mp) updated = await this.paymentsService.syncFromMp(mp);
    }
    if (updated?.status !== 'refunded') {
      // Reembolso manual, o Mercado Pago aún no lo refleja: queda reembolsado aquí.
      const prev = await this.payments
        .findOneAndUpdate(
          { _id: pay._id, status: 'approved' },
          { $set: { status: 'refunded' } },
          { returnDocument: 'before' },
        )
        .exec();
      updated = await this.payments.findById(pay._id).exec();
      if (prev && updated)
        await this.invoicing.onPayment({
          payment: updated,
          previousStatus: 'approved',
          mp: {} as never,
        });
    }
    await this.record(actor, pay.tenantId, 'refund', {
      paymentId: String(pay._id),
      amount: pay.amount,
      currency: pay.currency,
      provider: pay.provider,
      reason,
    });
    return { status: updated?.status };
  }

  /** Reenviar el acceso al administrador que aún no creó su contraseña. */
  async resendAccess(actor: Actor, id: string) {
    const t = await this.tenantOrThrow(id);
    const pending = await this.users
      .find({ tenantId: t._id, accessPending: true, isActive: { $ne: false } })
      .exec();
    if (!pending.length)
      throw new BadRequestException(
        'Ningún usuario tiene el acceso pendiente. Para cambiar una contraseña usa "Restablecer acceso" en Usuarios.',
      );
    for (const u of pending) await this.provisioning.sendAccess(u);
    await this.record(actor, t._id, 'resend_access', {
      to: pending.map((u) => u.email),
    });
    return { sent: pending.map((u) => u.email) };
  }

  /** Reenviar el comprobante (o la nota de crédito) por correo. */
  async resendReceipt(
    actor: Actor,
    paymentId: string,
    kind: 'receipt' | 'creditNote',
  ) {
    if (!Types.ObjectId.isValid(paymentId))
      throw new NotFoundException('Pago no encontrado');
    const pay = await this.payments.findById(paymentId).exec();
    if (!pay?.tenantId) throw new NotFoundException('Pago no encontrado');
    const doc = kind === 'creditNote' ? pay.receipt?.creditNote : pay.receipt;
    if (doc?.status !== 'issued')
      throw new BadRequestException('El comprobante aún no está emitido.');
    const logId = await this.mailer.idByKey(
      `receipt:${String(pay._id)}:${kind}`,
    );
    if (logId) await this.mailer.resend(logId);
    else await this.invoicing.emailReceipt(pay._id, kind);
    await this.record(actor, pay.tenantId, 'resend_receipt', {
      paymentId: String(pay._id),
      kind,
    });
    return { ok: true };
  }
}
