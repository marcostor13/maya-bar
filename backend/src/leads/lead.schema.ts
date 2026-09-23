import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  LEAD_STAGE_KEYS,
  DEFAULT_LEAD_STAGE,
  LEAD_PRIORITIES,
} from './lead-stages.catalog';

/**
 * Oportunidad de venta en seguimiento. Es la unidad del embudo: un contacto
 * puede tener varias a lo largo del tiempo, por eso no vive dentro de Customer.
 */
@Schema({ timestamps: true })
export class Lead extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  /** Contacto al que pertenece. Es obligatorio: no hay lead sin cliente. */
  @Prop({ type: Types.ObjectId, ref: 'Customer', required: true, index: true })
  customerId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ enum: LEAD_STAGE_KEYS, default: DEFAULT_LEAD_STAGE, index: true })
  stage: string;

  /** Derivado de la etapa; se guarda para poder filtrar y agregar sin recalcular. */
  @Prop({ enum: ['open', 'won', 'lost'], default: 'open', index: true })
  status: string;

  /** Valor estimado del negocio, en la moneda del tenant. */
  @Prop({ default: 0 })
  value: number;

  @Prop({ default: 'PEN', trim: true })
  currency: string;

  @Prop({ enum: LEAD_PRIORITIES, default: 'medium' })
  priority: string;

  /**
   * Responsable del seguimiento. Sin responsable, la oportunidad está en la
   * bolsa del equipo: cualquiera puede tomarla y, una vez tomada, es suya
   * hasta que la suelte o la derive (ver docs/reparto-de-leads.md).
   */
  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  ownerId?: Types.ObjectId;

  /** Desde cuándo la lleva el responsable actual. */
  @Prop({ type: Date })
  assignedAt?: Date;

  /** Quién se la asignó (él mismo si la tomó de la bolsa). */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  assignedBy?: Types.ObjectId;

  /** De dónde salió: whatsapp, instagram, formulario, importación, manual… */
  @Prop({ trim: true, default: 'manual' })
  source: string;

  /** Conversación que lo originó, para saltar al chat desde la ficha. */
  @Prop({ type: Types.ObjectId, ref: 'Conversation', index: true })
  conversationId?: Types.ObjectId;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: Date })
  expectedCloseDate?: Date;

  @Prop({ type: Date })
  closedAt?: Date;

  /** Por qué se perdió; se pide al mover a "Perdido". */
  @Prop({ trim: true })
  lostReason?: string;

  /** Última actividad registrada: ordena el tablero por lo que se movió. */
  @Prop({ type: Date, default: Date.now, index: true })
  lastActivityAt: Date;

  /** Vencimiento de la próxima tarea pendiente; null si no hay ninguna. */
  @Prop({ type: Date, index: true })
  nextActionAt?: Date;

  @Prop({ trim: true })
  nextActionTitle?: string;

  /** Posición dentro de la columna del tablero (menor = más arriba). */
  @Prop({ default: 0 })
  position: number;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;
}

export const LeadSchema = SchemaFactory.createForClass(Lead);

// El tablero pide siempre las oportunidades del tenant ordenadas por columna.
LeadSchema.index({ tenantId: 1, stage: 1, position: 1 });
LeadSchema.index({ tenantId: 1, lastActivityAt: -1 });
// Bolsa sin asignar y carga de trabajo por responsable.
LeadSchema.index({ tenantId: 1, status: 1, ownerId: 1 });
