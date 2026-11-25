import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { CheckoutSession } from './checkout-session.schema';
import { MercadoPagoClient } from './mercadopago/mercadopago.client';
import { PaymentsService } from './payments.service';
import { BillingHooks } from './billing-hooks.service';
import { SETUP_REF_SUFFIX } from './checkout.service';

/** Se espera unos minutos al webhook antes de preguntar. */
const AFTER_MS = 10 * 60_000;
/** Compras abandonadas hace más de una semana ya no se consultan. */
const MAX_AGE_MS = 7 * 24 * 3600_000;

/**
 * Conciliación de compras (HU78). La conciliación de `PaymentsService` solo
 * revisa pagos que ya llegaron por webhook; si Mercado Pago no avisa, una
 * compra pagada se quedaba sin activar. Aquí se consultan directamente las
 * compras sin confirmar: el pago único por su `external_reference` y la
 * suscripción mensual por su preapproval y sus cobros autorizados.
 */
@Injectable()
export class CheckoutReconcileService {
  private readonly logger = new Logger(CheckoutReconcileService.name);
  private running = false;

  constructor(
    @InjectModel(CheckoutSession.name) private sessions: Model<CheckoutSession>,
    private mp: MercadoPagoClient,
    private payments: PaymentsService,
    private hooks: BillingHooks,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async reconcile(now = new Date()): Promise<number> {
    if (!this.mp.configured() || this.running) return 0;
    this.running = true;
    let checked = 0;
    try {
      const list = await this.sessions
        .find({
          status: { $in: ['pending', 'awaiting_payment'] },
          createdAt: {
            $lt: new Date(now.getTime() - AFTER_MS),
            $gt: new Date(now.getTime() - MAX_AGE_MS),
          },
        })
        .select('publicId mpPreapprovalId')
        .sort({ createdAt: -1 })
        .limit(100)
        .lean()
        .exec();
      for (const s of list) {
        try {
          await this.check(s.publicId, s.mpPreapprovalId);
          checked++;
        } catch (err) {
          this.logger.warn(
            `No se pudo conciliar la compra ${s.publicId}: ${String(err)}`,
          );
        }
      }
    } finally {
      this.running = false;
    }
    return checked;
  }

  private async check(publicId: string, preapprovalId?: string) {
    if (preapprovalId) {
      const pre = await this.mp.getPreapproval(preapprovalId);
      await this.hooks.emitPreapproval(pre);
      // Cancelada antes de pagar: la compra no seguirá; no se vuelve a consultar.
      if (pre.status === 'cancelled') {
        await this.sessions
          .updateOne(
            { publicId, status: { $in: ['pending', 'awaiting_payment'] } },
            { $set: { status: 'rejected' } },
          )
          .exec();
        return;
      }
      if (pre.status !== 'authorized') return;
      for (const auth of await this.mp.searchAuthorizedPayments(
        preapprovalId,
      )) {
        if (!auth.payment?.id) continue;
        const p = await this.mp.getPayment(auth.payment.id);
        await this.payments.syncFromMp({
          ...p,
          preapproval_id: p.preapproval_id ?? preapprovalId,
        });
      }
      return;
    }
    for (const p of await this.mp.searchPayments(publicId))
      await this.payments.syncFromMp(p);
    // La implementación de un mensual va en una preferencia aparte (HU55).
    for (const p of await this.mp.searchPayments(
      `${publicId}${SETUP_REF_SUFFIX}`,
    ))
      await this.payments.syncFromMp(p);
  }
}
