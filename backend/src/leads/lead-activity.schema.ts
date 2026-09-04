import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ACTIVITY_TYPES } from './lead-stages.catalog';

/**
 * Entrada del historial de una oportunidad: una nota, una llamada, un cambio
 * de etapa o una tarea pendiente. Las tareas son actividades con `dueAt`, que
 * es lo que alimenta el "próximo paso" del lead.
 */
@Schema({ timestamps: true })
export class LeadActivity extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Lead', required: true, index: true })
  leadId: Types.ObjectId;

  @Prop({ required: true, enum: ACTIVITY_TYPES, default: 'note' })
  type: string;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ trim: true })
  body?: string;

  /** Cuándo ocurrió (o cuándo se registró). */
  @Prop({ type: Date, default: Date.now, index: true })
  at: Date;

  /** Solo en tareas: cuándo vence. */
  @Prop({ type: Date })
  dueAt?: Date;

  /** Solo en tareas: si ya se completó. */
  @Prop({ default: false })
  done: boolean;

  @Prop({ type: Date })
  doneAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;
}

export const LeadActivitySchema = SchemaFactory.createForClass(LeadActivity);
LeadActivitySchema.index({ leadId: 1, at: -1 });
// Tareas pendientes del tenant ordenadas por vencimiento (agenda y KPIs).
LeadActivitySchema.index({ tenantId: 1, done: 1, dueAt: 1 });
