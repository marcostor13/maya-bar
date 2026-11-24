import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PaymentStatus = 'approved' | 'pending' | 'rejected' | 'refunded';

export type ReceiptStatus = 'pending' | 'issued' | 'failed' | 'skipped';

/** Datos de un comprobante emitido (o en cola) ante SUNAT (HU49). */
export interface ReceiptDoc {
  status?: ReceiptStatus;
  /** 01 factura, 03 boleta, 07 nota de crédito. */
  type?: '01' | '03' | '07';
  /** Serie y número, p. ej. B001-123. Se reservan antes de llamar al proveedor. */
  series?: string;
  number?: number;
  pdfUrl?: string;
  xmlUrl?: string;
  cdrUrl?: string;
  acceptedBySunat?: boolean;
  attempts?: number;
  nextAttemptAt?: Date;
  error?: string;
  issuedAt?: Date;
  /** Por qué no se emite (pago en dólares fuera de Perú…). */
  skippedReason?: string;
}

export interface PaymentReceipt extends ReceiptDoc {
  /** Nota de crédito por reembolso o anulación (HU49 C3). */
  creditNote?: ReceiptDoc;
  /** El correo con el comprobante ya salió (HU49 C2). */
  emailedAt?: Date;
}

/**
 * Pagos de la suscripción, add-ons e implementación (HU44). Los escribe el
 * webhook de Mercado Pago (HU45) y el comprobante lo adjunta la HU49.
 */
@Schema({ collection: 'payments', timestamps: true })
export class Payment extends Document {
  /** Vacío mientras el pago de un alta nueva no crea la empresa (HU47). */
  @Prop({ type: Types.ObjectId, index: true })
  tenantId?: Types.ObjectId;

  @Prop({ required: true })
  concept: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ type: String, default: 'PEN' })
  currency: 'PEN' | 'USD';

  @Prop({ type: String, default: 'pending' })
  status: PaymentStatus;

  @Prop({ type: String, default: 'mercadopago' })
  provider: string;

  /** Id del pago en el proveedor; único para no duplicar avisos del webhook. */
  @Prop({ index: { unique: true, sparse: true } })
  providerPaymentId?: string;

  @Prop({ required: true })
  paidAt: Date;

  /** Referencia que enviamos al proveedor (checkout de HU46); sirve para conciliar. */
  @Prop({ index: true })
  externalReference?: string;

  /** Qué se cobró: plan, add-on, recarga, implementación (HU46+). */
  @Prop()
  kind?: string;

  /** Suscripción de Mercado Pago a la que pertenece el cobro (HU48). */
  @Prop()
  mpPreapprovalId?: string;

  /** El cobro ya movió el periodo de la suscripción (HU48): nunca dos veces. */
  @Prop()
  periodApplied?: boolean;

  @Prop()
  statusDetail?: string;

  /** `credit_card`, `debit_card`, `ticket` (PagoEfectivo), `account_money`… */
  @Prop()
  paymentType?: string;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  /** Reembolso pedido desde el panel (HU57): candado contra dobles clics. */
  @Prop()
  refundRequestedAt?: Date;

  createdAt?: Date;

  @Prop({ type: Object })
  receipt?: PaymentReceipt;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);
PaymentSchema.index({ tenantId: 1, paidAt: -1 });
