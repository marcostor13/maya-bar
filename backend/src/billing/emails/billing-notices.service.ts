import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { Tenant } from '../../tenants/tenant.schema';
import { CheckoutSession } from '../checkout-session.schema';
import { BillingHooks, type PaymentChange } from '../billing-hooks.service';
import { AiCreditsService, type CreditBalance } from '../ai-credits.service';
import { PLANS } from '../plans.catalog';
import { BillingMailer } from './billing-mailer.service';
import { T, rejectReason } from './billing-email.templates';

const DAY_MS = 24 * 3600_000;
/** Días que quedan de prueba en los que se avisa: día 10, 13 y 14 de 14. */
export const TRIAL_NOTICE_DAYS_LEFT = [4, 1, 0];

/**
 * Avisos de cobro que no nacen de un alta ni de un comprobante (HU50):
 * PagoEfectivo pendiente, pago rechazado de una compra, prueba por vencer y créditos de IA al 80 % / 100 %.
 */
@Injectable()
export class BillingNoticesService implements OnModuleInit {
  constructor(
    @InjectModel(Tenant.name) private tenants: Model<Tenant>,
    @InjectModel(CheckoutSession.name) private sessions: Model<CheckoutSession>,
    private hooks: BillingHooks,
    private credits: AiCreditsService,
    private mailer: BillingMailer,
  ) {}

  onModuleInit() {
    this.hooks.onPayment((e) => this.onPayment(e));
    this.credits.onUsage((t, b) => this.onCredits(t, b));
  }

  async onPayment({ payment, mp }: PaymentChange) {
    if (payment.status !== 'pending' && payment.status !== 'rejected') return;
    const session = payment.externalReference
      ? await this.sessions
          .findOne({ publicId: payment.externalReference })
          .lean()
          .exec()
      : null;
    // Cobro recurrente de una suscripción ya activa: lo avisa HU51 (PastDueService).
    if (payment.mpPreapprovalId) {
      const first = await this.sessions
        .findOne({ mpPreapprovalId: payment.mpPreapprovalId })
        .lean()
        .exec();
      if (
        first?.status === 'fulfilled' &&
        first.paymentId !== payment.providerPaymentId
      )
        return;
    }
    if (!session) return;
    const to = [session.billing?.email ?? '', session.buyer.email];
    const info = {
      planName: PLANS[session.plan].name,
      period: session.period,
      // Plan + implementación en el mismo cobro (HU55): el monto real.
      amount:
        session.setup && !session.setup.separate
          ? Math.round((session.total + session.setup.total) * 100) / 100
          : session.total,
      currency: session.currency,
    };
    if (payment.status === 'pending' && payment.paymentType === 'ticket') {
      await this.mailer.trySend({
        key: `pending:${payment.providerPaymentId}`,
        type: 'pending',
        to,
        tenantId: session.tenantId,
        paymentId: payment.providerPaymentId,
        content: T.pending({
          ...info,
          cip: mp.transaction_details?.payment_method_reference_id,
          ticketUrl: mp.transaction_details?.external_resource_url,
        }),
      });
    } else if (payment.status === 'rejected') {
      const q = new URLSearchParams({
        plan: session.plan,
        periodo: {
          monthly: 'mensual',
          quarterly: 'trimestral',
          annual: 'anual',
        }[session.period],
        moneda: session.currency,
      });
      await this.mailer.trySend({
        key: `rejected:${payment.providerPaymentId}`,
        type: 'rejected',
        to,
        tenantId: session.tenantId,
        paymentId: payment.providerPaymentId,
        content: T.rejected({
          ...info,
          reason: rejectReason(payment.statusDetail),
          retryUrl: this.mailer.frontendUrl(`/checkout?${q.toString()}`),
        }),
      });
    }
  }

  /** Recordatorios de prueba: quedan 4, 1 y 0 días (días 10, 13 y 14). */
  @Cron(CronExpression.EVERY_HOUR)
  async trialReminders(now = new Date()): Promise<number> {
    const trials = await this.tenants
      .find({
        'subscription.status': 'trialing',
        trialEndsAt: { $gt: now, $lte: new Date(now.getTime() + 5 * DAY_MS) },
        isActive: { $ne: false },
      })
      .select('_id trialEndsAt')
      .limit(500)
      .lean()
      .exec();
    let sent = 0;
    for (const t of trials) {
      const daysLeft = Math.floor(
        (t.trialEndsAt!.getTime() - now.getTime()) / DAY_MS,
      );
      if (!TRIAL_NOTICE_DAYS_LEFT.includes(daysLeft)) continue;
      const ok = await this.mailer.trySend({
        key: `trial:${String(t._id)}:${daysLeft}`,
        type: 'trial',
        to: await this.mailer.recipients(t._id),
        tenantId: t._id,
        content: T.trial({
          daysLeft,
          plansUrl: this.mailer.frontendUrl('/checkout'),
        }),
      });
      if (ok) sent++;
    }
    return sent;
  }

  /** Créditos de IA al 80 % y al 100 %, una vez por mes y umbral. */
  async onCredits(tenantId: string, b: CreditBalance) {
    if (b.unlimited) return;
    const pool = b.included + b.purchased;
    if (pool <= 0) return;
    const used = pool - b.remaining;
    const percent = used >= pool ? 100 : used >= pool * 0.8 ? 80 : 0;
    if (!percent) return;
    await this.mailer.trySend({
      key: `credits:${tenantId}:${b.period}:${percent}`,
      type: 'ai_credits',
      to: await this.mailer.recipients(tenantId),
      tenantId,
      content: T.aiCredits({
        percent,
        remaining: Math.max(0, b.remaining),
        total: pool,
        rechargeUrl: this.mailer.frontendUrl('/settings/plan'),
      }),
    });
  }
}
