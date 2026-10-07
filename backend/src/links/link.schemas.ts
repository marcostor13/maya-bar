import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export const LINK_CHANNELS = ['sms', 'email', 'whatsapp', 'other'] as const;
export type LinkChannel = (typeof LINK_CHANNELS)[number];

/**
 * Dominio propio para los links cortos. El dominio es único en toda la
 * plataforma: el `Host` de la petición decide de qué empresa es el link.
 *
 * - `pending`: el DNS todavía no apunta al servidor.
 * - `dns_ok`: el DNS apunta bien, pero el servidor aún no lo sirve (falta
 *   añadirlo al proxy y emitir el certificado).
 * - `active`: responde por https; ya se puede usar.
 */
@Schema({ timestamps: true })
export class ShortDomain extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, lowercase: true, trim: true, unique: true })
  domain: string;

  @Prop({
    type: String,
    enum: ['pending', 'dns_ok', 'active'],
    default: 'pending',
  })
  status: 'pending' | 'dns_ok' | 'active';

  @Prop({ default: false })
  isDefault: boolean;

  @Prop({ type: Date })
  checkedAt?: Date;

  /** Resultado legible de la última comprobación. */
  @Prop()
  checkMessage?: string;

  @Prop({ type: [String], default: [] })
  resolvedTo: string[];

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;
}
export const ShortDomainSchema = SchemaFactory.createForClass(ShortDomain);

export interface LinkUtm {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
}

export interface LinkRecipient {
  name?: string;
  phone?: string;
  email?: string;
}

@Schema({ timestamps: true })
export class ShortLink extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  /** Dominio corto; vacío = el dominio de la plataforma (`/l/:code`). */
  @Prop({ default: '', lowercase: true, trim: true })
  domain: string;

  @Prop({ required: true, trim: true })
  code: string;

  @Prop({ trim: true, default: '' })
  title: string;

  @Prop({ required: true, trim: true })
  destination: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  utm: LinkUtm;

  @Prop({ type: String, enum: ['active', 'paused'], default: 'active' })
  status: 'active' | 'paused';

  @Prop({ type: Date })
  expiresAt?: Date;

  /** Link personal: de quién es. Con esto un clic identifica al contacto. */
  @Prop({ type: Types.ObjectId, ref: 'Customer' })
  customerId?: Types.ObjectId;

  /** Destinatario cuando viene de un Excel y no es un contacto guardado. */
  @Prop({ type: MongooseSchema.Types.Mixed })
  recipient?: LinkRecipient;

  @Prop({ type: Types.ObjectId, ref: 'Campaign' })
  campaignId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'LinkBatch' })
  batchId?: Types.ObjectId;

  @Prop({ type: String, enum: LINK_CHANNELS })
  channel?: LinkChannel;

  // Contadores desnormalizados: el listado no puede agregar millones de clics.
  @Prop({ default: 0 })
  clicks: number;

  @Prop({ default: 0 })
  uniqueClicks: number;

  @Prop({ default: 0 })
  botClicks: number;

  @Prop({ type: Date })
  lastClickAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;
}
export const ShortLinkSchema = SchemaFactory.createForClass(ShortLink);
ShortLinkSchema.index({ domain: 1, code: 1 }, { unique: true });
ShortLinkSchema.index({ tenantId: 1, batchId: 1 });
ShortLinkSchema.index({ tenantId: 1, campaignId: 1 });
ShortLinkSchema.index({ tenantId: 1, createdAt: -1 });

@Schema({ timestamps: false })
export class LinkClick extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ShortLink', required: true })
  linkId: Types.ObjectId;

  @Prop({ type: Date, default: Date.now })
  at: Date;

  @Prop()
  ip?: string;

  @Prop()
  userAgent?: string;

  @Prop()
  browser?: string;

  @Prop()
  browserVersion?: string;

  @Prop()
  os?: string;

  @Prop({
    type: String,
    enum: ['mobile', 'tablet', 'desktop', 'bot', 'unknown'],
  })
  device?: string;

  @Prop({ default: false })
  isBot: boolean;

  /** Primer clic de este visitante en este link. */
  @Prop({ default: false })
  isUnique: boolean;

  /** Identificador del navegador (cookie `mlv`), para distinguir visitantes. */
  @Prop()
  visitorId?: string;

  @Prop()
  language?: string;

  @Prop()
  referer?: string;

  @Prop()
  refererHost?: string;

  /** Parámetros con los que se abrió el link corto. */
  @Prop({ type: MongooseSchema.Types.Mixed })
  query?: Record<string, string>;

  /** Cookies que el navegador envió al dominio corto. */
  @Prop({ type: MongooseSchema.Types.Mixed })
  cookies?: Record<string, string>;

  @Prop()
  country?: string;

  @Prop()
  city?: string;

  @Prop({ type: Types.ObjectId, ref: 'Customer' })
  customerId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Campaign' })
  campaignId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'LinkBatch' })
  batchId?: Types.ObjectId;
}
export const LinkClickSchema = SchemaFactory.createForClass(LinkClick);
LinkClickSchema.index({ linkId: 1, at: -1 });
LinkClickSchema.index({ tenantId: 1, at: -1 });
LinkClickSchema.index({ linkId: 1, visitorId: 1 });

/** Lote de links personales generados de una vez (lista o Excel). */
@Schema({ timestamps: true })
export class LinkBatch extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  destination: string;

  @Prop({ default: '' })
  domain: string;

  @Prop({ type: String, enum: LINK_CHANNELS, default: 'sms' })
  channel: LinkChannel;

  /** Mensaje predeterminado con variables; `{link}` es el link de cada fila. */
  @Prop({ default: '' })
  message: string;

  @Prop({ trim: true })
  subject?: string;

  @Prop({
    type: String,
    enum: ['lists', 'contacts', 'file'],
    default: 'contacts',
  })
  source: 'lists' | 'contacts' | 'file';

  @Prop({ default: 0 })
  count: number;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;
}
export const LinkBatchSchema = SchemaFactory.createForClass(LinkBatch);
