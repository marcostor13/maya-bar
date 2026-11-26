import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MetaCapiStatus = 'pending' | 'sent' | 'failed';

/**
 * Evento de la API de conversiones de Meta para la publicidad propia de Maya
 * CRM (HU84). Se guarda antes de salir a la red: el índice único por
 * `eventId` impide enviar dos veces el mismo hecho, y si Meta no responde se
 * reintenta con espera creciente.
 */
@Schema({ collection: 'meta_capi_events', timestamps: true })
export class MetaCapiEvent extends Document {
  /** `reg_<tenantId>` o `pay_<paymentId>`; es el `event_id` que deduplica con el píxel. */
  @Prop({ required: true, unique: true })
  eventId: string;

  @Prop({ required: true })
  eventName: string;

  @Prop({ type: Types.ObjectId, index: true })
  tenantId?: Types.ObjectId;

  /** El evento tal cual se manda en `data[]`. */
  @Prop({ type: Object, required: true })
  payload: Record<string, unknown>;

  @Prop({ type: String, default: 'pending', index: true })
  status: MetaCapiStatus;

  @Prop({ default: 0 })
  attempts: number;

  @Prop()
  nextAttemptAt?: Date;

  @Prop()
  lastError?: string;

  @Prop()
  sentAt?: Date;
}

export const MetaCapiEventSchema = SchemaFactory.createForClass(MetaCapiEvent);
MetaCapiEventSchema.index({ status: 1, nextAttemptAt: 1 });
