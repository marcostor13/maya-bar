import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Payment, PaymentStatus } from './payment.schema';
import { MercadoPagoClient, MpPayment } from './mercadopago/mercadopago.client';
import { BillingHooks } from './billing-hooks.service';

const RECONCILE_AFTER_MS = 30 * 60_000;
const RECONCILE_MAX_AGE_MS = 7 * 24 * 3600_000;

/** Estado de Mercado Pago → estado propio. */
export function mapMpStatus(status: string): PaymentStatus {
  switch (status) {
    case 'approved':
      return 'approved';
    case 'rejected':
    case 'cancelled':
      return 'rejected';
    case 'refunded':
    case 'charged_back':
      return 'refunded';
    default:
      // pending, in_process, authorized, in_mediation
      return 'pending';
  }
}

/**
 * Pagos de Mercado Pago (HU45): los sincroniza siempre con lo que dice la
 * API, nunca con el cuerpo del webhook, y concilia los pendientes por hora.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectModel(Payment.name) private payments: Model<Payment>,
    private mp: MercadoPagoClient,
    private hooks: BillingHooks,
  ) {}

  /** Guarda el pago tal como lo devolvió la API y avisa si cambió de estado. */
  async syncFromMp(mp: MpPayment): Promise<Payment> {
    const providerPaymentId = String(mp.id);
    const meta = mp.metadata ?? {};
    const tenantId =
      typeof meta.tenant_id === 'string' &&
      Types.ObjectId.isValid(meta.tenant_id)
        ? new Types.ObjectId(meta.tenant_id)
        : undefined;
    const status = mapMpStatus(mp.status);
    const preapprovalId =
      mp.preapproval_id ??
      mp.point_of_interaction?.transaction_data?.subscription_id;

    const set: Partial<Payment> = {
      providerPaymentId,
      provider: 'mercadopago',
      status,
      statusDetail: mp.status_detail,
      paymentType: mp.payment_type_id,
      amount: mp.transaction_amount,
      currency: mp.currency_id === 'USD' ? 'USD' : 'PEN',
      // Fecha del cobro solo si se aprobó; si no, la del intento.
      paidAt: new Date(mp.date_approved ?? mp.date_created ?? Date.now()),
      externalReference: mp.external_reference,
      ...(preapprovalId ? { mpPreapprovalId: preapprovalId } : {}),
      ...(typeof meta.kind === 'string' ? { kind: meta.kind } : {}),
    };

    // Atómico: cada escritura devuelve el documento ANTERIOR, así dos avisos
    // simultáneos del mismo pago no disparan el cambio de estado dos veces.
    let previous: Payment | null = null;
    if (mp.external_reference)
      previous = await this.payments
        .findOneAndUpdate(
          {
            externalReference: mp.external_reference,
            providerPaymentId: { $exists: false },
          },
          { $set: set },
          { new: false },
        )
        .exec();
    if (!previous) {
      for (let attempt = 0; ; attempt++) {
        try {
          previous = await this.payments
            .findOneAndUpdate(
              { providerPaymentId },
              {
                $set: set,
                $setOnInsert: {
                  concept: mp.description || 'Pago Mercado Pago',
                  metadata: meta,
                },
              },
              { upsert: true, new: false },
            )
            .exec();
          break;
        } catch (err) {
          // Carrera de dos upserts: el segundo reintenta como actualización.
          if ((err as { code?: number }).code !== 11000 || attempt > 0)
            throw err;
        }
      }
    }
    if (tenantId)
      await this.payments
        .updateOne(
          { providerPaymentId, tenantId: { $exists: false } },
          { $set: { tenantId } },
        )
        .exec();
    const payment = (await this.payments
      .findOne({ providerPaymentId })
      .exec()) as Payment;
    const previousStatus = previous?.status;
    if (previousStatus !== status)
      await this.hooks.emitPayment({ payment, previousStatus, mp });
    return payment;
  }

  /**
   * Conciliación (HU45 C4): pagos pendientes de más de 30 minutos se vuelven a
   * consultar por si el webhook no llegó.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async reconcile(now = new Date()): Promise<number> {
    if (!this.mp.configured()) return 0;
    const stale = await this.payments
      .find({
        provider: 'mercadopago',
        status: 'pending',
        // Checkouts abandonados hace más de una semana ya no se consultan.
        createdAt: {
          $lt: new Date(now.getTime() - RECONCILE_AFTER_MS),
          $gt: new Date(now.getTime() - RECONCILE_MAX_AGE_MS),
        },
      })
      .sort({ createdAt: -1 })
      .limit(200)
      .exec();
    let changed = 0;
    for (const p of stale) {
      try {
        const found = p.providerPaymentId
          ? [await this.mp.getPayment(p.providerPaymentId)]
          : p.externalReference
            ? await this.mp.searchPayments(p.externalReference)
            : [];
        for (const mp of found) {
          const synced = await this.syncFromMp(mp);
          if (synced.status !== 'pending') changed++;
        }
      } catch (err) {
        this.logger.warn(
          `No se pudo conciliar el pago ${String(p._id)}: ${String(err)}`,
        );
      }
    }
    if (changed) this.logger.log(`Conciliación: ${changed} pagos actualizados`);
    return changed;
  }
}
