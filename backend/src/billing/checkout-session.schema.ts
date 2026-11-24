import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import type { BillingPeriod, Currency, PlanId } from './plans.catalog';

/**
 * - `pending`: creada, esperando que pague en Mercado Pago.
 * - `awaiting_payment`: pago iniciado pero pendiente (PagoEfectivo).
 * - `paid`: el webhook o la conciliación confirmaron el pago.
 * - `rejected`: el pago fue rechazado; se puede intentar de nuevo.
 * - `fulfilled`: la cuenta ya quedó activa (HU47).
 */
export type CheckoutStatus =
  | 'pending'
  | 'awaiting_payment'
  | 'paid'
  | 'rejected'
  | 'fulfilled';

export interface CheckoutBuyer {
  company: string;
  name: string;
  email: string;
  phone?: string;
}

export interface CheckoutBilling {
  docType: 'boleta' | 'factura';
  docNumber: string;
  legalName: string;
  address?: string;
  email?: string;
}

/** Un intento de compra de un plan (HU46). */
/** Implementación contratada con el plan (HU55). Montos en la moneda del plan. */
export interface CheckoutSetup {
  id: string;
  name: string;
  price: number;
  /** Descuento por plan anual (sin IGV). */
  discount: number;
  subtotal: number;
  igv: number;
  total: number;
  /** Mensual: pago único aparte (`<publicId>:setup`). */
  separate?: boolean;
  mpPreferenceId?: string;
  redirectUrl?: string;
  paidAt?: Date;
  paymentId?: string;
}

export interface CheckoutCoupon {
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  /** Descuento sin IGV y precio de lista sin IGV. */
  discount: number;
  listSubtotal: number;
  duration: 'once' | 'months' | 'forever';
  durationMonths?: number;
  plans?: string[];
  periods?: string[];
  /** El cupo se liberó (24 h sin pago aprobado, o falló al abrir el pago). */
  releasedAt?: Date;
  /** Pago aprobado tras la liberación: el cupo volvió a contar (una sola vez). */
  reclaimedAt?: Date;
}

@Schema({ collection: 'checkout_sessions', timestamps: true })
export class CheckoutSession extends Document {
  /** Id público no adivinable: va en la URL de vuelta y en `external_reference`. */
  @Prop({ required: true, unique: true })
  publicId: string;

  @Prop({ type: String, required: true })
  plan: PlanId;

  @Prop({ type: String, required: true })
  period: BillingPeriod;

  @Prop({ type: String, required: true })
  currency: Currency;

  @Prop({ required: true })
  subtotal: number;

  @Prop({ required: true })
  igv: number;

  @Prop({ required: true })
  total: number;

  /** Suscripción automática (mensual) o pago único (trimestral/anual). */
  @Prop({ type: String, required: true })
  mode: 'subscription' | 'one_time';

  /** `upgrade`: cobro de la diferencia al subir de plan, no suma periodo (HU52). */
  @Prop({ type: String, default: 'plan' })
  kind: 'plan' | 'upgrade' | 'addon';

  /** Add-on o recarga comprada (HU53). */
  @Prop()
  addonId?: string;

  @Prop()
  addonQty?: number;

  /** Subida (HU52): plan y fin de periodo con los que se calculó la diferencia. */
  @Prop()
  upgradeFrom?: string;

  @Prop()
  quotedPeriodEnd?: Date;

  /** Cupón reservado (HU54): `subtotal` ya trae el descuento. */
  @Prop({ type: Object })
  coupon?: CheckoutCoupon;

  /** Renovación del mismo plan (HU48): conserva el descuento pactado. */
  @Prop()
  renewal?: boolean;

  /** Implementación (HU55): no entra en `subtotal`/`total`, que son del plan. */
  @Prop({ type: Object })
  setup?: CheckoutSetup;

  @Prop({ type: Object, required: true })
  buyer: CheckoutBuyer;

  @Prop({ type: Object, required: true })
  billing: CheckoutBilling;

  /** Empresa existente que compra desde su cuenta (en prueba). */
  @Prop({ type: Types.ObjectId })
  tenantId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  userId?: Types.ObjectId;

  @Prop({ type: String, default: 'pending', index: true })
  status: CheckoutStatus;

  @Prop()
  mpPreferenceId?: string;

  @Prop()
  mpPreapprovalId?: string;

  @Prop()
  redirectUrl?: string;

  /** Medio del último pago (`ticket` = PagoEfectivo, `credit_card`…). */
  @Prop()
  paymentMethod?: string;

  @Prop()
  paymentId?: string;

  /**
   * Avance del alta (HU47): cada paso se anota al terminar, así un reintento
   * tras un fallo continúa donde quedó sin crear otra empresa ni sumar otro periodo.
   */
  @Prop({ type: Object })
  provision?: {
    branch?: 'account' | 'existing' | 'new' | 'conflict';
    tenantId?: Types.ObjectId;
    planActivated?: boolean;
    billingSaved?: boolean;
    userId?: Types.ObjectId;
    accessSent?: boolean;
    notified?: boolean;
  };

  /** Candado del alta: solo un proceso la trabaja a la vez. */
  @Prop()
  provisioningUntil?: Date;

  /** Se marca aquí para que el alta (HU47) sea idempotente. */
  @Prop()
  fulfilledAt?: Date;

  createdAt?: Date;
}

export const CheckoutSessionSchema =
  SchemaFactory.createForClass(CheckoutSession);
