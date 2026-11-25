import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { Tenant } from '../tenants/tenant.schema';
import { User } from '../users/user.schema';
import { BillingMailer } from './emails/billing-mailer.service';
import { T, rejectReason } from './emails/billing-email.templates';
import { PastDueService } from './past-due.service';
import {
  MercadoPagoClient,
  type MpPreapproval,
} from './mercadopago/mercadopago.client';
import { MP_CANCEL_REASON, PlanChangeService } from './plan-change.service';
import { Payment } from './payment.schema';
import { CheckoutSession } from './checkout-session.schema';
import { BillingHooks, type PaymentChange } from './billing-hooks.service';
import { BillingAccessService } from './billing-access.service';
import { CheckoutService } from './checkout.service';
import { PLANS, addMonths, priceFor } from './plans.catalog';
import { agreedPrice } from './agreed-price';

const DAY_MS = 24 * 3600_000;
/** Aviso de renovación de los planes de pago único: 7 días antes (HU48 C3). */
export const RENEWAL_NOTICE_DAYS = 7;
/** Mercado Pago cobra el día del vencimiento; se le da margen antes de marcar impago. */
const MONTHLY_LEEWAY_MS = 2 * DAY_MS;
/** Gracia por defecto al quedar impago; HU51 la ajusta. */
/** Días de gracia con todo funcionando tras un cobro fallido (HU51). */
export const DEFAULT_GRACE_DAYS = 7;

export { addMonths };

/**
 * Ciclo de vida de la suscripción (HU48). La suscripción vive en
 * `tenant.subscription` (HU41) y los cobros en `payments` (HU44/HU45):
 * - Mensual: cada cobro aprobado del preapproval avanza el periodo un mes.
 * - Trimestral/anual: aviso con enlace de pago 7 días antes; al pagar, la
 *   compra de renovación (HU46/HU47) suma el periodo.
 * - Vencido sin cobro: `past_due` con gracia (HU51 decide qué se bloquea).
 */
@Injectable()
export class SubscriptionLifecycleService implements OnModuleInit {
  private readonly logger = new Logger(SubscriptionLifecycleService.name);

  constructor(
    @InjectModel(Tenant.name) private tenants: Model<Tenant>,
    @InjectModel(Payment.name) private payments: Model<Payment>,
    @InjectModel(CheckoutSession.name) private sessions: Model<CheckoutSession>,
    @InjectModel(User.name) private users: Model<User>,
    private hooks: BillingHooks,
    private checkout: CheckoutService,
    private mailer: BillingMailer,
    private pastDue: PastDueService,
    private mp: MercadoPagoClient,
    private planChange: PlanChangeService,
    private access: BillingAccessService,
  ) {}

  onModuleInit() {
    this.hooks.onPayment((e) => this.onRecurringPayment(e));
    this.hooks.onPayment((e) => this.onRecurringRejected(e));
    this.hooks.onPreapproval((p) => this.onPreapprovalCancelled(p));
  }

  /**
   * HU78: el cliente canceló la suscripción desde Mercado Pago (no desde
   * Maya). Ya no habrá cobros: queda activa hasta el fin del periodo pagado.
   */
  async onPreapprovalCancelled(pre: MpPreapproval) {
    if (pre.status !== 'cancelled' || !pre.id) return;
    // En impago no hay periodo pagado por delante: se cierra ya (como HU51).
    const pastDue = await this.tenants
      .findOneAndUpdate(
        {
          'subscription.mpPreapprovalId': pre.id,
          'subscription.status': 'past_due',
        },
        {
          $set: {
            'subscription.status': 'canceled',
            'subscription.canceledAt': new Date(),
            'subscription.cancelReason': MP_CANCEL_REASON,
          },
        },
      )
      .select('_id')
      .lean()
      .exec();
    if (pastDue) {
      this.access.invalidate(String(pastDue._id));
      return;
    }
    const res = await this.tenants
      .findOneAndUpdate(
        {
          'subscription.mpPreapprovalId': pre.id,
          'subscription.status': 'active',
          'subscription.cancelAtPeriodEnd': { $ne: true },
        },
        {
          $set: {
            'subscription.cancelAtPeriodEnd': true,
            'subscription.canceledAt': new Date(),
            'subscription.cancelReason': MP_CANCEL_REASON,
          },
        },
      )
      .select('_id')
      .lean()
      .exec();
    if (res) {
      this.access.invalidate(String(res._id));
      this.logger.log(
        `Suscripción ${pre.id} cancelada desde Mercado Pago: termina al fin del periodo`,
      );
    }
  }

  /** ¿Es un cobro automático de una suscripción ya dada de alta (no la compra)? */
  private async recurringTenant({ payment, mp }: PaymentChange) {
    const preapprovalId = payment.mpPreapprovalId;
    if (!preapprovalId) return null;
    const tenant = await this.tenants
      .findOne({ 'subscription.mpPreapprovalId': preapprovalId })
      .exec();
    if (!tenant) {
      // Cobro de una suscripción ya reemplazada: no mueve el periodo, se avisa.
      if (payment.status === 'approved') {
        const old = await this.tenants
          .exists({ 'subscription.preapprovalsToCancel': preapprovalId })
          .exec();
        if (old)
          this.logger.warn(
            `Cobro ${payment.providerPaymentId} de una suscripción reemplazada (${preapprovalId}): revisar reembolso`,
          );
      }
      return null;
    }
    const first = await this.sessions
      .findOne({ mpPreapprovalId: preapprovalId })
      .lean()
      .exec();
    // Es la compra (o un intento de ella que llegó tarde), no un cobro mensual:
    // nació antes de que la compra se diera de alta.
    const created = mp.date_created ? new Date(mp.date_created) : undefined;
    if (
      first &&
      (first.status !== 'fulfilled' ||
        first.paymentId === payment.providerPaymentId ||
        (created && first.fulfilledAt && created < first.fulfilledAt))
    )
      return null;
    return tenant;
  }

  /**
   * Cobro mensual rechazado (HU51) → `past_due` con 7 días de gracia y aviso
   * del día 0. Los reintentos de Mercado Pago que vuelvan a fallar no
   * reinician la gracia.
   */
  async onRecurringRejected(e: PaymentChange) {
    const { payment, previousStatus } = e;
    if (payment.status !== 'rejected' || previousStatus === 'rejected') return;
    const tenant = await this.recurringTenant(e);
    if (!tenant) return;
    const now = new Date();
    const res = await this.tenants
      .updateOne(
        {
          _id: tenant._id,
          'subscription.status': 'active',
          // Ya canceló: no es un impago (HU52).
          'subscription.cancelAtPeriodEnd': { $ne: true },
        },
        {
          $set: {
            'subscription.status': 'past_due',
            'subscription.pastDueSince': now,
            'subscription.graceEndsAt': new Date(
              now.getTime() + DEFAULT_GRACE_DAYS * DAY_MS,
            ),
          },
        },
      )
      .exec();
    this.access.invalidate(String(tenant._id));
    if (res.modifiedCount === 1)
      await this.pastDue.notify(
        tenant._id,
        0,
        rejectReason(payment.statusDetail),
      );
  }

  /** Cobro mensual automático aprobado → el periodo avanza un mes (C1). */
  async onRecurringPayment({ payment, previousStatus, mp }: PaymentChange) {
    if (payment.status !== 'approved' || previousStatus === 'approved') return;
    const tenant = await this.recurringTenant({
      payment,
      previousStatus,
      mp,
    });
    if (!tenant) return; // primer cobro: lo activa el alta (HU47)

    // Una sola escritura sobre la empresa: avanza el periodo y anota el cobro
    // (`appliedPayments`). Condicionada al fin leído, así dos cobros a la vez
    // no pisan el mismo mes; si cae, el reintento la repite (nada a medias).
    const payId = payment.providerPaymentId!;
    for (let attempt = 0; attempt < 5; attempt++) {
      const t =
        attempt === 0 ? tenant : await this.tenants.findById(tenant._id).exec();
      if (!t) return;
      const sub = t.subscription;
      if (sub?.appliedPayments?.includes(payId)) break;
      const now = new Date();
      const end = sub?.currentPeriodEnd;
      // Exactamente un mes desde el fin vigente; si llevaba mucho vencida, desde hoy.
      const base =
        end && end.getTime() > now.getTime() - 31 * DAY_MS ? end : now;
      const res = await this.tenants
        .updateOne(
          {
            _id: t._id,
            'subscription.currentPeriodEnd': end ?? null,
            'subscription.appliedPayments': { $ne: payId },
          },
          {
            $set: {
              'subscription.status': 'active',
              'subscription.currentPeriodEnd': addMonths(base, 1),
            },
            $unset: {
              'subscription.graceEndsAt': '',
              'subscription.pastDueSince': '',
              'subscription.longExpiredNoticeAt': '',
            },
            $push: {
              'subscription.appliedPayments': { $each: [payId], $slice: -36 },
            },
          },
        )
        .exec();
      if (res.modifiedCount === 1) break;
    }
    await this.payments
      .updateOne(
        { _id: payment._id },
        {
          $set: { periodApplied: true, tenantId: tenant._id, kind: 'renewal' },
        },
      )
      .exec();
    this.access.invalidate(String(tenant._id));
    // Bajada programada (HU52): entra con el primer cobro del periodo nuevo.
    await this.planChange.applyPending(tenant._id);
    const fresh = await this.tenants.findById(tenant._id).lean().exec();
    await this.mailer.trySend({
      key: `paid:${payment.providerPaymentId}`,
      type: 'payment_confirmed',
      to: await this.mailer.recipients(tenant._id),
      tenantId: tenant._id,
      paymentId: payment.providerPaymentId,
      content: T.paymentConfirmed({
        planName: PLANS[tenant.plan]?.name ?? tenant.plan,
        period: fresh?.subscription?.period,
        amount: payment.amount,
        currency: payment.currency,
        nextDate: fresh?.subscription?.currentPeriodEnd,
        accountUrl: this.mailer.frontendUrl('/settings/plan'),
      }),
    });
  }

  /** Aviso de renovación de los planes trimestrales y anuales (C3). */
  @Cron(CronExpression.EVERY_HOUR)
  async sendRenewalNotices(now = new Date()): Promise<number> {
    const due = await this.tenants
      .find({
        'subscription.status': 'active',
        'subscription.cancelAtPeriodEnd': { $ne: true },
        'subscription.period': { $in: ['quarterly', 'annual'] },
        'subscription.currentPeriodEnd': {
          $gt: now,
          $lte: new Date(now.getTime() + RENEWAL_NOTICE_DAYS * DAY_MS),
        },
        isActive: { $ne: false },
        // Los ya avisados de este periodo no ocupan el lote.
        $expr: {
          $ne: [
            '$subscription.renewalNoticeFor',
            '$subscription.currentPeriodEnd',
          ],
        },
      })
      .limit(100)
      .exec();
    let sent = 0;
    for (const t of due) {
      const end = t.subscription!.currentPeriodEnd!;
      // Una sola vez por periodo: se marca antes de enviar.
      const mark = await this.tenants
        .updateOne(
          { _id: t._id, 'subscription.renewalNoticeFor': { $ne: end } },
          { $set: { 'subscription.renewalNoticeFor': end } },
        )
        .exec();
      if (mark.modifiedCount !== 1) continue;
      try {
        await this.sendRenewal(t, end);
        sent++;
      } catch (err) {
        // Se desmarca para reintentar en la próxima corrida.
        await this.tenants
          .updateOne(
            { _id: t._id },
            { $unset: { 'subscription.renewalNoticeFor': '' } },
          )
          .exec();
        this.logger.error(`Aviso de renovación ${t.slug}: ${String(err)}`);
      }
    }
    return sent;
  }

  private async sendRenewal(t: Tenant, end: Date) {
    const sub = t.subscription!;
    const admin = await this.users
      .findOne({ tenantId: t._id, role: 'TENANT_ADMIN', isActive: true })
      .sort({ createdAt: 1 })
      .lean()
      .exec();
    const to = admin?.email ?? t.email;
    const billing = (t as unknown as { billingInfo?: Record<string, string> })
      .billingInfo;
    const res = await this.checkout.createRenewal({
      tenantId: String(t._id),
      plan: sub.pendingPlan ?? t.plan,
      period: sub.period!,
      currency: sub.currency ?? 'PEN',
      // Con cambio de plan pendiente (HU52) se cobra el precio del plan nuevo;
      // si no, el pactado (C2).
      amount:
        // Un descuento que termina con este periodo (HU54) ya no entra en el próximo.
        (sub.pendingPlan && sub.pendingPlan !== t.plan
          ? agreedPrice(
              t,
              sub.pendingPlan,
              sub.period!,
              sub.currency ?? 'PEN',
              end,
            )
          : sub.discount?.endsAt && new Date(sub.discount.endsAt) <= end
            ? agreedPrice(t, t.plan, sub.period!, sub.currency ?? 'PEN', end)
            : sub.amount) ??
        priceFor(t.plan, sub.period!, sub.currency ?? 'PEN') ??
        0,
      buyer: { company: t.name, name: admin?.name ?? t.name, email: to },
      billing: {
        docType: (billing?.docType as 'boleta' | 'factura') ?? 'boleta',
        docNumber: billing?.docNumber ?? '',
        legalName: billing?.legalName ?? t.name,
        address: billing?.address,
      },
    });
    await this.mailer.send({
      key: `renewal:${String(t._id)}:${end.toISOString()}`,
      type: 'renewal',
      to: [to, billing?.email ?? ''],
      tenantId: t._id,
      content: T.renewal({
        planName: res.planName,
        period: res.period,
        amount: res.total,
        currency: res.currency,
        endDate: end,
        payUrl: res.redirectUrl!,
      }),
    });
  }

  /** Periodo vencido sin cobro → `past_due` con gracia (HU51). */
  @Cron(CronExpression.EVERY_HOUR)
  async markPastDue(now = new Date()): Promise<number> {
    const graceEndsAt = new Date(now.getTime() + DEFAULT_GRACE_DAYS * DAY_MS);
    const filter = (
      period: unknown,
      cutoff: Date,
    ): Record<string, unknown> => ({
      'subscription.status': 'active',
      // Cancelado a fin de periodo: lo cierra `endCanceled` (HU52), no es impago.
      'subscription.cancelAtPeriodEnd': { $ne: true },
      'subscription.period': period,
      'subscription.currentPeriodEnd': { $lt: cutoff },
    });
    const ids = (
      await this.tenants
        .find({
          $or: [
            filter({ $in: ['quarterly', 'annual'] }, now),
            filter('monthly', new Date(now.getTime() - MONTHLY_LEEWAY_MS)),
          ],
        })
        .select('_id')
        .lean()
        .exec()
    ).map((t) => t._id);
    if (!ids.length) return 0;
    const res = await this.tenants
      .updateMany(
        // Se repite el corte: si un cobro avanzó el periodo mientras tanto, no entra.
        {
          _id: { $in: ids },
          $or: [
            filter({ $in: ['quarterly', 'annual'] }, now),
            filter('monthly', new Date(now.getTime() - MONTHLY_LEEWAY_MS)),
          ],
        },
        {
          $set: {
            'subscription.status': 'past_due',
            'subscription.graceEndsAt': graceEndsAt,
            'subscription.pastDueSince': now,
          },
        },
      )
      .exec();
    ids.forEach((id) => this.access.invalidate(String(id)));
    return res.modifiedCount;
  }

  /** Cancela en Mercado Pago las suscripciones reemplazadas (HU51): sin cobro doble. */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async cancelReplacedPreapprovals(): Promise<number> {
    const list = await this.tenants
      .find({ 'subscription.preapprovalsToCancel.0': { $exists: true } })
      .select('_id subscription.preapprovalsToCancel')
      .limit(100)
      .lean()
      .exec();
    let n = 0;
    for (const t of list)
      for (const id of t.subscription?.preapprovalsToCancel ?? []) {
        try {
          await this.mp.updatePreapproval(id, { status: 'cancelled' });
          await this.tenants
            .updateOne(
              { _id: t._id },
              { $pull: { 'subscription.preapprovalsToCancel': id } },
            )
            .exec();
          n++;
        } catch (err) {
          this.logger.error(
            `No se pudo cancelar la suscripción ${id}: ${String(err)}`,
          );
        }
      }
    return n;
  }
}
