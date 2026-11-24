import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Canales que se pueden compartir por API: los que tienen chat en la bandeja
 * y el proveedor SMS de la empresa (HU14, su "cuenta" es el `SmsConfig`).
 */
export const API_CHANNELS = [
  'whatsapp',
  'instagram',
  'messenger',
  'sms',
] as const;
/** Canales con conversación en la bandeja. */
export type ChatChannel = Exclude<ApiChannel, 'sms'>;
export type ApiChannel = (typeof API_CHANNELS)[number];

export const DEFAULT_PER_MINUTE = 60;
export const DEFAULT_PER_DAY = 2000;

/**
 * Acceso de API (HU13): una clave secreta que envía mensajes por UNA cuenta
 * conectada de la empresa, solo desde los dominios autorizados.
 *
 * La clave no se guarda: solo su hash SHA-256 (que es además la clave de
 * búsqueda) y un prefijo para reconocerla en pantalla.
 */
@Schema({ timestamps: true, collection: 'api_accesses' })
export class ApiAccess extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, required: true, enum: [...API_CHANNELS] })
  channel: ApiChannel;

  @Prop({ type: Types.ObjectId, required: true })
  accountId: Types.ObjectId;

  /** Nombre de la cuenta al crear el acceso, para la lista. */
  @Prop({ default: '' })
  accountLabel: string;

  @Prop({ required: true, unique: true })
  keyHash: string;

  @Prop({ required: true })
  keyPrefix: string;

  /**
   * `website`: llamada desde la web de la empresa (exige dominio autorizado).
   * `automation`: Zapier, Make o un servidor propio (HU65): sin cabecera
   * Origin, y además da acceso a la API del CRM (`/api/v1`).
   */
  @Prop({ type: String, enum: ['website', 'automation'], default: 'website' })
  purpose: 'website' | 'automation';

  /** Hosts autorizados (`dominio.com` o `*.dominio.com`). Al menos uno en `website`. */
  @Prop({ type: [String], default: [] })
  allowedDomains: string[];

  /** IPs desde las que se acepta la llamada; vacía = cualquiera. */
  @Prop({ type: [String], default: [] })
  allowedIps: string[];

  @Prop({ default: DEFAULT_PER_MINUTE })
  perMinuteLimit: number;

  @Prop({ default: DEFAULT_PER_DAY })
  perDayLimit: number;

  @Prop()
  revokedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop()
  lastUsedAt?: Date;

  @Prop({ default: 0 })
  sentCount: number;

  /** URL https de la empresa que recibe los avisos (HU15). */
  @Prop()
  webhookUrl?: string;

  /** Secreto HMAC de los avisos, cifrado con `SecretBox`. */
  @Prop()
  webhookSecret?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ApiAccessSchema = SchemaFactory.createForClass(ApiAccess);

/** Contador de envíos por acceso y ventana (minuto o día). Caduca solo. */
@Schema({ collection: 'api_usages' })
export class ApiUsage extends Document {
  @Prop({ type: Types.ObjectId, required: true })
  accessId: Types.ObjectId;

  /** `m:<minuto epoch>` o `d:<AAAA-MM-DD>` (UTC). */
  @Prop({ required: true })
  bucket: string;

  @Prop({ default: 0 })
  count: number;

  @Prop({ required: true })
  expiresAt: Date;
}

export const ApiUsageSchema = SchemaFactory.createForClass(ApiUsage);
ApiUsageSchema.index({ accessId: 1, bucket: 1 }, { unique: true });
ApiUsageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/** SMS enviado por la API (HU14). No hay bandeja SMS: se registra aquí. */
@Schema({ collection: 'api_sms_messages' })
export class ApiSmsMessage extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ApiAccess', required: true })
  accessId: Types.ObjectId;

  @Prop({ default: '' })
  accessName: string;

  /** Número en E.164 (`+51999888777`). */
  @Prop({ required: true })
  to: string;

  @Prop({ default: '' })
  text: string;

  /** Partes en que el operador divide el SMS (para el costo, HU18). */
  @Prop({ default: 1 })
  segments: number;

  @Prop({
    type: String,
    enum: ['pending', 'sent', 'failed'],
    default: 'pending',
  })
  status: 'pending' | 'sent' | 'failed';

  @Prop()
  error?: string;

  /** Id del mensaje según el proveedor. */
  @Prop()
  providerId?: string;

  @Prop()
  idempotencyKey?: string;

  @Prop({ type: Date, default: Date.now, index: true })
  at: Date;
}

export const ApiSmsMessageSchema = SchemaFactory.createForClass(ApiSmsMessage);
ApiSmsMessageSchema.index(
  { accessId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: 'string' } },
  },
);

export const WEBHOOK_EVENTS = [
  'message.sent',
  'message.delivered',
  'message.read',
  'message.failed',
  'message.received',
  'ping',
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** Aviso a la URL de la empresa (HU15): bandeja de salida con reintentos. */
@Schema({ collection: 'api_webhook_deliveries', timestamps: true })
export class ApiWebhookDelivery extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ApiAccess', required: true })
  accessId: Types.ObjectId;

  @Prop({ type: String, required: true, enum: [...WEBHOOK_EVENTS] })
  event: WebhookEvent;

  /** Mensaje del aviso (o id propio en un `ping`): con `event`, la idempotencia. */
  @Prop({ required: true })
  refId: string;

  @Prop({ type: Object, required: true })
  payload: Record<string, unknown>;

  @Prop({
    type: String,
    enum: ['pending', 'delivered', 'failed'],
    default: 'pending',
  })
  status: 'pending' | 'delivered' | 'failed';

  @Prop({ default: 0 })
  attempts: number;

  @Prop({ type: Date, default: Date.now })
  nextAttemptAt: Date;

  /** Código HTTP de la última respuesta. */
  @Prop()
  lastStatus?: number;

  @Prop()
  lastError?: string;

  @Prop()
  deliveredAt?: Date;

  createdAt?: Date;
}

export const ApiWebhookDeliverySchema =
  SchemaFactory.createForClass(ApiWebhookDelivery);
ApiWebhookDeliverySchema.index(
  { accessId: 1, refId: 1, event: 1 },
  { unique: true },
);
ApiWebhookDeliverySchema.index({ status: 1, nextAttemptAt: 1 });
ApiWebhookDeliverySchema.index({ accessId: 1, createdAt: -1 });
// Los avisos se guardan 30 días.
ApiWebhookDeliverySchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 30 * 24 * 3600 },
);
