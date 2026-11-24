import { Injectable, Logger } from '@nestjs/common';
import type { Payment } from './payment.schema';
import type {
  MpPayment,
  MpPreapproval,
} from './mercadopago/mercadopago.client';

export interface PaymentChange {
  payment: Payment;
  previousStatus?: string;
  mp: MpPayment;
}

type Handler<T> = (event: T) => Promise<void> | void;

/**
 * Punto de enganche de lo que pasa en el proveedor de pagos (HU45). Las
 * historias siguientes se suscriben aquí: alta de cuenta (HU47), ciclo de
 * suscripción (HU48), comprobante (HU49), correos (HU50)…
 */
@Injectable()
export class BillingHooks {
  private readonly logger = new Logger(BillingHooks.name);
  private payment: Handler<PaymentChange>[] = [];
  private preapproval: Handler<MpPreapproval>[] = [];

  onPayment(h: Handler<PaymentChange>) {
    this.payment.push(h);
  }

  onPreapproval(h: Handler<MpPreapproval>) {
    this.preapproval.push(h);
  }

  /** Corre los suscriptores en orden; un fallo hace reintentar el evento. */
  async emitPayment(e: PaymentChange) {
    for (const h of this.payment) await h(e);
  }

  async emitPreapproval(e: MpPreapproval) {
    for (const h of this.preapproval) await h(e);
  }
}
