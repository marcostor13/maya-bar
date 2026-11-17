import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/** Canales que se pueden compartir por API: los que tienen chat en la bandeja. */
export const API_CHANNELS = ['whatsapp', 'instagram', 'messenger'] as const;
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

  /** Hosts autorizados (`dominio.com` o `*.dominio.com`). Al menos uno. */
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
