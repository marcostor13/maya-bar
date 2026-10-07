import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export interface ResendDomain {
  name: string;
  /** Estado en Resend: `verified`, `pending`, `failed`… */
  status: string;
}

/**
 * Cuenta de Resend de una empresa. Con ella los correos masivos salen con su
 * propia API key y su propio dominio remitente, en lugar del de la plataforma.
 */
@Schema({ timestamps: true })
export class ResendConfig extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, unique: true })
  tenantId: Types.ObjectId;

  @Prop({ default: false })
  enabled: boolean;

  /** API key cifrada con `SecretBox`; nunca sale del backend. */
  @Prop()
  sealedKey?: string;

  /** Últimos caracteres de la key, para reconocerla sin mostrarla. */
  @Prop({ default: '' })
  keyHint: string;

  @Prop({ trim: true, lowercase: true, default: '' })
  fromEmail: string;

  @Prop({ trim: true, default: '' })
  fromName: string;

  @Prop({ trim: true, lowercase: true, default: '' })
  replyTo: string;

  /** Tope de envíos por minuto, para no superar el límite de la cuenta. */
  @Prop({ default: 100, min: 10, max: 600 })
  ratePerMinute: number;

  /** Dominios de la cuenta según la última comprobación. */
  @Prop({ type: [{ name: String, status: String, _id: false }], default: [] })
  domains: ResendDomain[];

  @Prop({ type: Date })
  checkedAt?: Date;
}

export const ResendConfigSchema = SchemaFactory.createForClass(ResendConfig);
