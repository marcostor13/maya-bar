import type { AgreedDiscount } from '../billing/coupons/coupon-math';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import type {
  BillingPeriod,
  Currency,
  LimitKey,
  PlanId,
} from '../billing/plans.catalog';

export type TenantPlan = PlanId;

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'expired'
  | 'canceled';

/**
 * Estado de cobro de la empresa (HU41, HU48). Se escribe siempre con `$set`
 * por ruta (`subscription.status`), por eso es un objeto libre.
 */
export interface TenantSubscription {
  status: SubscriptionStatus;
  period?: BillingPeriod;
  currency?: Currency;
  /** Precio pactado por periodo, sin IGV: no cambia si cambia el catálogo. */
  amount?: number;
  currentPeriodEnd?: Date;
  /** Fin de la gracia tras un cobro fallido (HU51). */
  graceEndsAt?: Date;
  /** Desde cuándo está en `past_due`: marca los avisos de los días 0, 3 y 6 (HU51). */
  pastDueSince?: Date;
  cancelAtPeriodEnd?: boolean;
  /** Suscripción automática de Mercado Pago (mensual). */
  mpPreapprovalId?: string;
  /** Suscripciones de Mercado Pago reemplazadas que falta cancelar (HU51). */
  preapprovalsToCancel?: string[];
  /** Motivo y fecha de la cancelación (HU52, para medir la baja). */
  cancelReason?: string;
  canceledAt?: Date;
  /** Desde cuándo entra `pendingPlan` cuando la renovación ya se pagó (HU52). */
  pendingPlanFrom?: Date;
  /** Descuento pactado por cupón (HU54); sin `endsAt` es de por vida. */
  discount?: AgreedDiscount;
  /** Usuarios que el cliente eligió conservar al bajar de plan (HU52 C3). */
  pendingKeepUsers?: string[];
  /** Monto mensual con IGV que falta aplicar al `preapproval` (HU52). */
  preapprovalAmountTarget?: number;
  /** Ya se avisó al superadmin de los 60 días en solo lectura (HU51). */
  longExpiredNoticeAt?: Date;
  /** Plan que entra en vigor al renovar (bajada de plan, HU52). */
  pendingPlan?: PlanId;
  /** Fin de periodo para el que ya salió el aviso de renovación (HU48 C3). */
  renewalNoticeFor?: Date;
  /** Cobros recurrentes que ya movieron el periodo (HU48): idempotencia. */
  appliedPayments?: string[];
  /** Precio fundador congelado (HU54). */
  founder?: boolean;
}

@Schema({ timestamps: true })
export class Tenant extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  slug: string;

  @Prop()
  ruc?: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop()
  phone?: string;

  @Prop({ type: String, default: 'inicia' })
  plan: TenantPlan;

  /** Cliente anterior al catálogo de planes: sin límites hasta que se decida (HU40). */
  @Prop({ default: false })
  legacy?: boolean;

  @Prop()
  planExpiresAt?: Date;

  @Prop()
  trialEndsAt?: Date;

  @Prop({ type: Object })
  subscription?: TenantSubscription;

  /** Unidades extra compradas por recurso (HU42, HU53). */
  @Prop({ type: Object })
  addons?: Partial<Record<LimitKey, number>>;

  /** Add-ons mensuales contratados por id y cantidad (HU53): entran en cada cobro. */
  @Prop({ type: Object })
  addonItems?: Record<string, number>;

  /** Compras de add-ons ya aplicadas (HU53): evita aplicar dos veces la misma. */
  @Prop({ type: [String], default: undefined })
  appliedPurchases?: string[];

  /** Emails de campaña encolados en el mes (HU53): cupo atómico. */
  @Prop({ type: Object })
  emailQuota?: { period: string; queued: number };

  /** Recarga de emails de campaña que queda y su vencimiento (HU53). */
  @Prop({ default: 0 })
  campaignEmailsPurchased?: number;

  @Prop()
  campaignEmailsPurchasedExpiresAt?: Date;

  /** Créditos de IA comprados que quedan (HU43, HU53). */
  @Prop({ default: 0 })
  aiCreditsPurchased?: number;

  /** Las recargas vencen a los 12 meses de la última compra. */
  @Prop()
  aiCreditsPurchasedExpiresAt?: Date;

  /** Datos del comprobante electrónico (HU44, HU49). */
  @Prop({ type: Object })
  billingInfo?: {
    docType: 'boleta' | 'factura';
    docNumber: string;
    legalName: string;
    address?: string;
    email?: string;
  };

  @Prop({
    type: {
      logo: String,
      favicon: String,
      primaryColor: String,
      secondaryColor: String,
    },
    default: {},
  })
  branding: {
    logo?: string;
    /** Icono de la pestaña en la landing de sus eventos (HU26). */
    favicon?: string;
    primaryColor?: string;
    secondaryColor?: string;
  };

  @Prop({ default: true })
  isActive: boolean;

  /**
   * Empresa de tipo agencia (HU72): la activa el superadmin con las
   * sub-cuentas incluidas en su plan. Sin este campo, es una empresa normal.
   */
  @Prop({ type: Object })
  agency?: { seats: number };

  /** Agencia dueña de esta sub-cuenta (HU72); la factura le llega a ella. */
  @Prop({ type: Types.ObjectId, ref: 'Tenant', index: true })
  parentTenantId?: Types.ObjectId;

  /** Marca blanca de la agencia (HU72): nombre, logo, color y dominio del panel. */
  @Prop({ type: Object })
  whiteLabel?: {
    appName?: string;
    logo?: string;
    favicon?: string;
    primaryColor?: string;
    panelDomain?: string;
  };

  /** Tarifas que la empresa paga a sus proveedores, para estimar costos (HU18). */
  @Prop({ type: Object })
  messageCosts?: { smsPerSegment?: number; emailPer1000?: number };

  /** Doble factor obligatorio para todo el equipo (HU62). */
  @Prop({ default: false })
  require2fa: boolean;

  /** De qué campaña llegó la empresa al registrarse (HU84). */
  @Prop({ type: Object })
  acquisition?: TenantAcquisition;
}

/**
 * Origen del registro (HU84): parámetros UTM y de Meta del primer toque, y si
 * la persona aceptó las cookies de medición. Sin `consent` no se envía nada a
 * la API de conversiones.
 */
export interface TenantAcquisition {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  fbclid?: string;
  fbc?: string;
  fbp?: string;
  landingPath?: string;
  referrer?: string;
  consent: boolean;
  ip?: string;
  userAgent?: string;
  capturedAt: Date;
}

export const TenantSchema = SchemaFactory.createForClass(Tenant);
