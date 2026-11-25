import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { Tenant } from '../../tenants/tenant.schema';
import { CheckoutSession } from '../checkout-session.schema';
import { BillingHooks, type PaymentChange } from '../billing-hooks.service';
import { AiCreditsService, type CreditBalance } from '../ai-credits.service';
import { PLANS } from '../plans.catalog';
import { BillingMailer } from './billing-mailer.service';
import { T, periodName, rejectReason } from './billing-email.templates';

const DAY_MS = 24 * 3600_000;
/** Destino del aviso de ventas si no se configura `SALES_NOTIFY_EMAIL` (HU75). */
export const DEFAULT_SALES_EMAIL = 'admin@ignia.site';

/** Medios de pago de Mercado Pago en lenguaje claro (HU75). */
const PAYMENT_TYPES: Record<string, string> = {
  credit_card: 'Tarjeta de crédito',
  debit_card: 'Tarjeta de débito',
  prepaid_card: 'Tarjeta prepago',
  ticket: 'PagoEfectivo',
  bank_transfer: 'Transferencia',
  account_money: 'Dinero en cuenta de Mercado Pago',
  digital_wallet: 'Billetera digital (Yape)',
};

/** Qué se vendió: el plan y su periodo si es una compra de plan; si no, el concepto del pago. */
function saleConcept(
  payment: { concept: string; externalReference?: string },
  session?: { plan: string; period: string; kind?: string } | null,
): string {
  if (!session || session.kind === 'addon') return payment.concept;
  const plan = PLANS[session.plan as keyof typeof PLANS]?.name ?? session.plan;
  const what = payment.externalReference?.endsWith(':setup')
    ? `Implementación · Plan ${plan}`
    : `Plan ${plan} (${periodName(session.period)})`;
  return session.kind === 'upgrade' ? `Cambio a ${what}` : what;
}
/** Días que quedan de prueba en los que se avisa: día 10, 13 y 14 de 14. */
export const TRIAL_NOTICE_DAYS_LEFT = [4, 1, 0];

/**
 * Avisos de cobro que no nacen de un alta ni de un comprobante (HU50):
 * PagoEfectivo pendiente, pago rechazado de una compra, prueba por vencer y créditos de IA al 80 % / 100 %.
 */
@Injectable()
export class BillingNoticesService implements OnModuleInit {
  private readonly logger = new Logger(BillingNoticesService.name);

  constructor(
    @InjectModel(Tenant.name) private tenants: Model<Tenant>,
    @InjectModel(CheckoutSession.name) private sessions: Model<CheckoutSession>,
    private hooks: BillingHooks,
    private credits: AiCreditsService,
    private mailer: BillingMailer,
    private config: ConfigService,
  ) {}

  onModuleInit() {
    this.hooks.onPayment((e) => this.onPayment(e));
    this.credits.onUsage((t, b) => this.onCredits(t, b));
  }

  async onPayment({ payment, mp, previousStatus }: PaymentChange) {
    if (payment.status === 'approved' && previousStatus !== 'approved') {
      // El aviso de venta nunca frena ni reintenta el procesamiento del pago.
      try {
        await this.saleAlert(payment);
      } catch (err) {
        this.logger.error(
          `Aviso de venta ${payment.providerPaymentId}: ${String(err)}`,
        );
      }
      return;
    }
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

  /**
   * Aviso interno de cada venta con los datos para facturar a mano (HU75).
   * Destino: `SALES_NOTIFY_EMAIL` (por defecto admin@ignia.site). La clave
   * de la bitácora evita repetirlo cuando Mercado Pago reenvía el webhook.
   */
  private async saleAlert(payment: PaymentChange['payment']) {
    const to = (
      this.config.get<string>('SALES_NOTIFY_EMAIL') || DEFAULT_SALES_EMAIL
    )
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    if (!to.length) return;
    // La compra: por su referencia (sin el sufijo `:setup`) o, en una
    // renovación, la primera compra de la misma suscripción.
    const ref = payment.externalReference?.split(':')[0];
    const session =
      (ref
        ? await this.sessions.findOne({ publicId: ref }).lean().exec()
        : null) ??
      (payment.mpPreapprovalId
        ? await this.sessions
            .findOne({ mpPreapprovalId: payment.mpPreapprovalId })
            .sort({ createdAt: 1 })
            .lean()
            .exec()
        : null);
    const tenantId = payment.tenantId ?? session?.tenantId;
    const tenant = tenantId
      ? await this.tenants.findById(tenantId).select('name').lean().exec()
      : null;
    const auto = this.config.get<string>('INVOICING_AUTO') === 'true';
    await this.mailer.trySend({
      key: `sale:${payment.providerPaymentId ?? String(payment._id)}`,
      type: 'sale',
      to,
      tenantId,
      paymentId: payment.providerPaymentId,
      content: T.saleAlert({
        concept: saleConcept(payment, session),
        amount: payment.amount,
        currency: payment.currency,
        paidAt: payment.paidAt,
        paymentType:
          PAYMENT_TYPES[payment.paymentType ?? ''] ?? payment.paymentType,
        providerPaymentId: payment.providerPaymentId,
        company: tenant?.name ?? session?.buyer?.company,
        buyer: session?.buyer,
        billing: session?.billing,
        invoicing: auto ? 'auto' : 'manual',
        url: this.mailer.frontendUrl('/admin/billing'),
      }),
    });
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
