import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Etapa del embudo de un tenant. La clave es estable (es lo que guarda
 * `leads.stage`); renombrar solo cambia la etiqueta.
 */
@Schema({ timestamps: true, collection: 'leadstages' })
export class LeadStageEntry extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  key: string;

  @Prop({ required: true, trim: true })
  label: string;

  @Prop({ required: true, default: '#6366F1' })
  color: string;

  /** Probabilidad de cierre (0-100) para el valor ponderado del embudo. */
  @Prop({ default: 0, min: 0, max: 100 })
  probability: number;

  @Prop({ default: 0 })
  order: number;

  /** Etapa terminal. Hay exactamente una de cada y no se pueden borrar. */
  @Prop({ type: String, enum: ['won', 'lost'] })
  outcome?: 'won' | 'lost';
}

export const LeadStageEntrySchema =
  SchemaFactory.createForClass(LeadStageEntry);

LeadStageEntrySchema.index({ tenantId: 1, key: 1 }, { unique: true });
LeadStageEntrySchema.index({ tenantId: 1, order: 1 });
