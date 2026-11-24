import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Bitácora de correos de cobro (HU50). `key` es única: el mismo aviso nunca
 * sale dos veces aunque se repita el webhook; el superadmin puede reenviarlo.
 */
@Schema({ collection: 'billing_emails', timestamps: true })
export class BillingEmail extends Document {
  @Prop({ required: true, unique: true })
  key: string;

  @Prop({ required: true })
  type: string;

  @Prop({ type: Types.ObjectId, index: true })
  tenantId?: Types.ObjectId;

  @Prop()
  paymentId?: string;

  @Prop({ type: [String], default: [] })
  to: string[];

  @Prop({ required: true })
  subject: string;

  @Prop({ required: true })
  html: string;

  @Prop()
  text?: string;

  /** Destinatarios a los que ya llegó: un reintento no los repite. */
  @Prop({ type: [String], default: [] })
  delivered: string[];

  /** Envío en curso: reserva la clave; vencido, otro proceso lo retoma. */
  @Prop()
  lockedUntil?: Date;

  /** La copia guardada omite el enlace de acceso: no se reenvía tal cual. */
  @Prop({ default: false })
  redacted: boolean;

  /** Llegó a todos los destinatarios. */
  @Prop()
  sentAt?: Date;

  @Prop({ default: 0 })
  resends: number;

  createdAt?: Date;
}

export const BillingEmailSchema = SchemaFactory.createForClass(BillingEmail);
