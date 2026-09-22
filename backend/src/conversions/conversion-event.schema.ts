import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Qué se le reporta a la plataforma de anuncios:
 * - `lead`: la oportunidad se calificó (hay intención real).
 * - `schedule`: se agendó una cita o una reserva.
 * - `purchase`: se cobró (oportunidad ganada).
 */
export const CONVERSION_EVENTS = ['lead', 'schedule', 'purchase'] as const;
export type ConversionEventType = (typeof CONVERSION_EVENTS)[number];

/** Objeto de negocio que dispara la conversión; junto al id, deduplica. */
export const CONVERSION_REF_TYPES = ['lead', 'reservation', 'manual'] as const;
export type ConversionRefType = (typeof CONVERSION_REF_TYPES)[number];

export const CONVERSION_STATUSES = ['pending', 'sent', 'failed'] as const;
export type ConversionStatus = (typeof CONVERSION_STATUSES)[number];

/**
 * Conversión pendiente de avisar (o ya avisada) al sistema de atribución.
 *
 * Se guarda en Mongo antes de salir a la red: si el destino está caído o el
 * proceso se muere en mitad de un despliegue, el evento sigue ahí y se
 * reintenta. Un cobro que no se reporta es dinero que la campaña no se anota.
 */
@Schema({ timestamps: true })
export class ConversionEvent extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: String, required: true, enum: CONVERSION_EVENTS })
  event: ConversionEventType;

  @Prop({ type: String, required: true, enum: CONVERSION_REF_TYPES })
  refType: ConversionRefType;

  @Prop({ required: true })
  refId: string;

  // --- Atribución (de dónde salió el cliente) ---
  @Prop() ctwaClid?: string;
  @Prop() adId?: string;
  @Prop() sourceUrl?: string;

  // --- Contacto, tal como se manda ---
  @Prop() contactName?: string;
  @Prop() phone?: string;
  @Prop() email?: string;

  @Prop({ default: 0 })
  value: number;

  @Prop({ default: 'PEN' })
  currency: string;

  @Prop()
  notes?: string;

  @Prop({ type: Date, default: Date.now })
  occurredAt: Date;

  // --- Entrega ---
  @Prop({
    type: String,
    enum: CONVERSION_STATUSES,
    default: 'pending',
    index: true,
  })
  status: ConversionStatus;

  @Prop({ default: 0 })
  attempts: number;

  @Prop()
  lastError?: string;

  @Prop({ type: Date, default: Date.now, index: true })
  nextAttemptAt: Date;

  @Prop({ type: Date })
  sentAt?: Date;
}

export const ConversionEventSchema =
  SchemaFactory.createForClass(ConversionEvent);

// Una conversión por hecho de negocio: mover una oportunidad a "Calificado",
// sacarla y volverla a meter no puede reportarse dos veces.
ConversionEventSchema.index(
  { tenantId: 1, event: 1, refType: 1, refId: 1 },
  { unique: true },
);
ConversionEventSchema.index({ tenantId: 1, createdAt: -1 });
