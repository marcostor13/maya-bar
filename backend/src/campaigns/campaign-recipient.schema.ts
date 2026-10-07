import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const RECIPIENT_STATUSES = [
  'pending',
  'sent',
  'failed',
  'skipped',
] as const;
export type RecipientStatus = (typeof RECIPIENT_STATUSES)[number];

/**
 * Un destinatario de una campaña de email o SMS. Se crean todos al pulsar
 * "Enviar" y el worker los va despachando por lotes: es lo que permite
 * reanudar tras un reinicio y saber qué pasó con cada persona.
 */
@Schema({ timestamps: true })
export class CampaignRecipient extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Campaign', required: true })
  campaignId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Customer', required: true })
  customerId: Types.ObjectId;

  @Prop({ default: '' })
  name: string;

  /** Email o teléfono al que se envía. Vacío si el contacto no lo tiene. */
  @Prop({ default: '' })
  to: string;

  @Prop({ type: String, enum: RECIPIENT_STATUSES, default: 'pending' })
  status: RecipientStatus;

  /** Por qué falló o se omitió. */
  @Prop()
  error?: string;

  /** Id del mensaje según el proveedor. */
  @Prop()
  providerId?: string;

  @Prop({ default: 0 })
  attempts: number;

  @Prop({ type: Date })
  sentAt?: Date;

  /** Link corto personal de este destinatario, si la campaña usa `{link}`. */
  @Prop()
  shortUrl?: string;

  @Prop({ type: Types.ObjectId, ref: 'ShortLink' })
  linkId?: Types.ObjectId;
}

export const CampaignRecipientSchema =
  SchemaFactory.createForClass(CampaignRecipient);
CampaignRecipientSchema.index({ campaignId: 1, status: 1 });
CampaignRecipientSchema.index(
  { campaignId: 1, customerId: 1 },
  { unique: true },
);
