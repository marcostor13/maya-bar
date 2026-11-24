import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/** Formulario de anuncio de Meta conocido por la empresa y su mapeo (HU60). */
@Schema({ timestamps: true, collection: 'lead_ad_forms' })
export class LeadAdForm extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'MessengerAccount' })
  accountId?: Types.ObjectId;

  @Prop({ required: true })
  pageId: string;

  /** Id del formulario en Meta. */
  @Prop({ required: true })
  formId: string;

  @Prop({ trim: true })
  name?: string;

  /** Preguntas del formulario (clave de Meta y texto visible). */
  @Prop({ type: [{ key: String, label: String, _id: false }], default: [] })
  questions: { key: string; label?: string }[];

  /** Pregunta → destino en Maya (ver `FieldTarget`). */
  @Prop({ type: Object, default: {} })
  mapping: Record<string, string>;

  /** Crear oportunidad además del contacto. */
  @Prop({ default: true })
  createLead: boolean;

  /** En pausa no se importan sus leads (quedan como `skipped`). */
  @Prop({ default: true })
  active: boolean;

  @Prop({ default: 0 })
  leadsCount: number;

  @Prop({ type: Date })
  lastLeadAt?: Date;
}

export const LeadAdFormSchema = SchemaFactory.createForClass(LeadAdForm);
LeadAdFormSchema.index({ tenantId: 1, formId: 1 }, { unique: true });

export const LEAD_AD_STATUSES = [
  'pending',
  'processed',
  'failed',
  'skipped',
] as const;
export type LeadAdStatus = (typeof LEAD_AD_STATUSES)[number];

/** Cada lead recibido de Meta: bitácora e idempotencia por `leadgenId`. */
@Schema({ timestamps: true, collection: 'lead_ad_leads' })
export class LeadAdLead extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'MessengerAccount' })
  accountId?: Types.ObjectId;

  @Prop({ required: true, unique: true })
  leadgenId: string;

  @Prop({ required: true })
  pageId: string;

  @Prop() formId?: string;
  @Prop() formName?: string;
  @Prop() adId?: string;
  @Prop() adName?: string;
  @Prop() adsetId?: string;
  @Prop() adsetName?: string;
  @Prop() campaignId?: string;
  @Prop() campaignName?: string;

  @Prop({
    type: String,
    enum: LEAD_AD_STATUSES,
    default: 'pending',
    index: true,
  })
  status: LeadAdStatus;

  @Prop({ default: 0 })
  attempts: number;

  @Prop() error?: string;

  @Prop({ type: Types.ObjectId, ref: 'Customer' })
  customerId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Lead' })
  leadId?: Types.ObjectId;

  /** Si el contacto ya existía y solo se actualizó. */
  @Prop() existingContact?: boolean;

  @Prop({ type: Date, required: true })
  receivedAt: Date;

  /** Candado del procesado: dos réplicas no lo importan a la vez. */
  @Prop({ type: Date })
  lockedUntil?: Date;
}

export const LeadAdLeadSchema = SchemaFactory.createForClass(LeadAdLead);
LeadAdLeadSchema.index({ tenantId: 1, receivedAt: -1 });
