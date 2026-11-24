import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type BillingEventStatus =
  | 'pending'
  | 'processing'
  | 'processed'
  | 'failed';

/**
 * Notificación de un proveedor de pago guardada en bruto (HU45). El índice
 * único `provider + eventId + type` hace que un reenvío no se procese dos veces.
 */
@Schema({ collection: 'billing_events', timestamps: true })
export class BillingEvent extends Document {
  @Prop({ required: true, default: 'mercadopago' })
  provider: string;

  @Prop({ required: true })
  eventId: string;

  /** `payment`, `subscription_preapproval`, `subscription_authorized_payment`… */
  @Prop({ required: true })
  type: string;

  @Prop()
  action?: string;

  /** Id del recurso que hay que volver a consultar en la API. */
  @Prop({ required: true })
  dataId: string;

  @Prop({ type: String, default: 'pending', index: true })
  status: BillingEventStatus;

  @Prop({ default: 0 })
  attempts: number;

  @Prop()
  nextAttemptAt?: Date;

  /** Candado mientras un proceso lo trabaja; vencido, otro puede retomarlo. */
  @Prop()
  lockedUntil?: Date;

  @Prop()
  error?: string;

  @Prop()
  processedAt?: Date;

  @Prop({ type: Object })
  raw?: Record<string, unknown>;

  createdAt?: Date;
}

export const BillingEventSchema = SchemaFactory.createForClass(BillingEvent);
BillingEventSchema.index(
  { provider: 1, eventId: 1, type: 1 },
  { unique: true },
);
