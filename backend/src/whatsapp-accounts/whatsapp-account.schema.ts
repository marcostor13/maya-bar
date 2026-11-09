import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/** Ajustes locales de las llamadas (lo que vive en Meta se lee de su API). */
export interface CallingPrefs {
  /** Segundos que suena antes de darla por perdida (15–60). */
  ringTimeoutSec: number;
  /** Responder por WhatsApp a las llamadas perdidas. */
  missedReplyEnabled: boolean;
  missedReplyText?: string;
}

export const DEFAULT_CALLING_PREFS: CallingPrefs = {
  ringTimeoutSec: 30,
  missedReplyEnabled: false,
};

@Schema({ timestamps: true })
export class WhatsAppAccount extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true })
  label: string; // nombre legible de la cuenta

  @Prop({ required: true, enum: ['cloudapi'] })
  provider: string;

  @Prop()
  phoneNumber?: string; // número visible (informativo)

  // WhatsApp Cloud API
  @Prop() waPhoneNumberId?: string;
  @Prop() waAccessToken?: string;
  @Prop() waBusinessAccountId?: string;
  @Prop() waVerifyToken?: string; // token de verificación del webhook (Meta)
  /**
   * Secreto de la app de Meta propia de la empresa (solo cuentas con URL de
   * webhook por cuenta). Firma los webhooks; nunca sale en la API.
   */
  @Prop({ select: false }) waAppSecret?: string;

  @Prop({ type: Object })
  calling?: CallingPrefs;

  @Prop({ type: Date })
  tokenExpiresAt?: Date; // vencimiento del access token (solo cuentas conectadas vía OAuth)

  @Prop({ default: true })
  active: boolean;

  @Prop({ default: false })
  isDefault: boolean; // cuenta usada por campañas y demás envíos salientes
}

export const WhatsAppAccountSchema =
  SchemaFactory.createForClass(WhatsAppAccount);
