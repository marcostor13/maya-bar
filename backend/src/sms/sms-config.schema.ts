import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const SMS_BODY_TYPES = ['json', 'form', 'query', 'none'] as const;
export type SmsBodyType = (typeof SMS_BODY_TYPES)[number];

export interface SmsHeader {
  key: string;
  value: string;
}

export interface SmsSecret {
  name: string;
  /** Valor cifrado con `SecretBox`; nunca sale del backend. */
  sealed: string;
}

/**
 * Proveedor de SMS de una empresa, definido como una petición HTTP genérica:
 * así sirve cualquier proveedor sin escribir código por cada uno.
 *
 * En `url`, `headers` y `body` se pueden usar `{to}`, `{to_digits}`,
 * `{message}`, `{from}`, `{secret:nombre}` y `{basic:usuario:clave}` (este
 * último arma una cabecera Basic con dos secretos).
 */
@Schema({ timestamps: true })
export class SmsConfig extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, unique: true })
  tenantId: Types.ObjectId;

  @Prop({ default: false })
  enabled: boolean;

  /** Nombre del proveedor, solo para mostrarlo. */
  @Prop({ trim: true, default: '' })
  name: string;

  @Prop({ trim: true, default: '' })
  url: string;

  @Prop({ type: String, enum: ['POST', 'GET', 'PUT'], default: 'POST' })
  method: 'POST' | 'GET' | 'PUT';

  @Prop({ type: [{ key: String, value: String, _id: false }], default: [] })
  headers: SmsHeader[];

  @Prop({ type: String, enum: SMS_BODY_TYPES, default: 'json' })
  bodyType: SmsBodyType;

  @Prop({ default: '' })
  body: string;

  /** Remitente: número o identificador alfanumérico. */
  @Prop({ trim: true, default: '' })
  from: string;

  @Prop({ type: [{ name: String, sealed: String, _id: false }], default: [] })
  secrets: SmsSecret[];

  /**
   * Cómo reconocer el éxito además del código 2xx: ruta en el JSON de
   * respuesta (`status` o `messages.0.status.groupName`) y el valor esperado.
   * Vacío = basta con el 2xx.
   */
  @Prop({ trim: true, default: '' })
  successPath: string;

  @Prop({ trim: true, default: '' })
  successValue: string;

  /** Ruta en la respuesta donde viene el id del mensaje. */
  @Prop({ trim: true, default: '' })
  idPath: string;

  /** Prefijo que se añade a los números sin código de país. */
  @Prop({ trim: true, default: '51' })
  defaultCountryCode: string;

  /** Tope de envíos por minuto, para no superar el del proveedor. */
  @Prop({ default: 60, min: 1, max: 600 })
  ratePerMinute: number;
}

export const SmsConfigSchema = SchemaFactory.createForClass(SmsConfig);
