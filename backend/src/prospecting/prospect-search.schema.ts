import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const SEARCH_STATUSES = ['searching', 'done', 'failed'] as const;
export type SearchStatus = (typeof SEARCH_STATUSES)[number];

/**
 * Una búsqueda de prospectos: qué vende la empresa y a quién quiere venderle.
 * La IA la convierte en consultas, las fuentes devuelven empresas y la IA las
 * puntúa según encajen con los servicios. El resultado son `Prospect`.
 */
@Schema({ timestamps: true })
export class ProspectSearch extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  /** Descripción completa de los servicios que ofrece la empresa. */
  @Prop({ required: true })
  services: string;

  /** Cliente ideal: sector, tamaño, señales de que nos necesita. */
  @Prop({ default: '' })
  idealCustomer: string;

  /** Ciudad, región o país donde buscar. */
  @Prop({ default: '' })
  location: string;

  @Prop({ type: [String], default: [] })
  industries: string[];

  @Prop({ default: 20 })
  maxResults: number;

  @Prop({
    type: String,
    enum: SEARCH_STATUSES,
    default: 'searching',
    index: true,
  })
  status: SearchStatus;

  /** Consultas que generó la IA y se lanzaron contra las fuentes. */
  @Prop({ type: [String], default: [] })
  queries: string[];

  /** Perfil de cliente ideal que resumió la IA; se reutiliza en el material. */
  @Prop({ default: '' })
  idealProfile: string;

  /** Fuentes que respondieron: google_places, serper, ai. */
  @Prop({ type: [String], default: [] })
  sources: string[];

  /** Paso en curso, para mostrar el progreso. */
  @Prop({ default: '' })
  progress: string;

  @Prop({ default: 0 })
  found: number;

  @Prop()
  error?: string;

  @Prop({ default: 0 })
  attempts: number;

  @Prop({ type: Date })
  lockedUntil?: Date | null;
}

export const ProspectSearchSchema =
  SchemaFactory.createForClass(ProspectSearch);
ProspectSearchSchema.index({ tenantId: 1, createdAt: -1 });
