import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CampaignType = 'email' | 'whatsapp' | 'sms';
export type CampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'sending'
  | 'sent'
  | 'failed';
export type CampaignTargeting = 'all' | 'tags' | 'lists' | 'contacts';

/** Recuento por estado de los destinatarios (email y SMS). */
export interface CampaignStats {
  total: number;
  pending: number;
  sent: number;
  failed: number;
  skipped: number;
}
export type WaProvider = 'waha' | 'cloudapi';
export type MediaType = 'image' | 'video' | 'audio' | 'document';

@Schema({ timestamps: true })
export class Campaign extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ type: String, enum: ['email', 'whatsapp', 'sms'], required: true })
  type: CampaignType;

  @Prop({ type: String, enum: ['waha', 'cloudapi'], default: 'waha' })
  waProvider?: WaProvider;

  @Prop()
  subject?: string;

  /** Texto del mensaje. Vacío en un email que usa plantilla HTML. */
  @Prop({ default: '' })
  body: string;

  @Prop({
    type: String,
    enum: ['all', 'tags', 'lists', 'contacts'],
    default: 'tags',
  })
  targeting: CampaignTargeting;

  /** Destinatarios elegidos a mano (`targeting: 'contacts'`). */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Customer' }], default: [] })
  customerIds: Types.ObjectId[];

  @Prop({ type: [String], default: [] })
  recipientTags: string[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'ContactList' }], default: [] })
  listIds: Types.ObjectId[];

  @Prop({ default: 0 })
  recipientCount: number;

  @Prop({
    type: String,
    enum: ['draft', 'scheduled', 'sending', 'sent', 'failed'],
    default: 'draft',
  })
  status: CampaignStatus;

  // ── Email con plantilla ──
  @Prop({ type: Types.ObjectId, ref: 'EmailTemplate' })
  emailTemplateId?: Types.ObjectId;

  /**
   * Copia del HTML de la plantilla tomada al enviar: si la plantilla se edita
   * a mitad de un envío, todos reciben lo mismo.
   */
  @Prop()
  html?: string;

  @Prop()
  preheader?: string;

  /** Buzón de la empresa desde el que sale; vacío = remitente de la plataforma. */
  @Prop({ type: Types.ObjectId, ref: 'EmailAccount' })
  senderAccountId?: Types.ObjectId;

  // ── Link corto personal ──
  /** Destino de `{link}`: cada destinatario recibe su propio link corto. */
  @Prop()
  linkUrl?: string;

  /** Dominio corto para esos links; vacío = el predeterminado. */
  @Prop()
  linkDomain?: string;

  // ── Envío en segundo plano (email y SMS) ──
  @Prop({ type: Date })
  scheduledAt?: Date;

  @Prop({ type: Date })
  startedAt?: Date;

  @Prop({
    type: {
      total: Number,
      pending: Number,
      sent: Number,
      failed: Number,
      skipped: Number,
      _id: false,
    },
  })
  stats?: CampaignStats;

  /** Candado del worker: evita que dos procesos envíen la misma campaña. */
  @Prop({ type: Date })
  lockedUntil?: Date;

  @Prop()
  sentAt?: Date;

  @Prop()
  errorMessage?: string;

  @Prop()
  mediaUrl?: string;

  @Prop({ type: String, enum: ['image', 'video', 'audio', 'document'] })
  mediaType?: MediaType;

  // Cloud API template fields
  @Prop()
  templateName?: string;

  @Prop()
  templateLanguage?: string;

  @Prop({ type: [String], default: [] })
  templateVars?: string[];
}

export const CampaignSchema = SchemaFactory.createForClass(Campaign);
// Lo que busca el worker en cada pasada.
CampaignSchema.index({ status: 1, type: 1, scheduledAt: 1 });
