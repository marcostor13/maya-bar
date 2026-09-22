import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/** Etapas propias de la prospección, antes de que el prospecto sea un lead. */
export const PROSPECT_STATUSES = [
  'new',
  'qualified',
  'contacted',
  'meeting',
  'converted',
  'discarded',
] as const;
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

export type JobState = 'idle' | 'queued' | 'running' | 'done' | 'failed';

export interface ProspectPerson {
  name: string;
  role?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  source?: string;
  notes?: string;
  customerId?: string;
}

export interface ResearchStep {
  key: string;
  label: string;
  status: 'ok' | 'skipped' | 'failed';
  detail?: string;
}

/** Todo lo que se sabe de la empresa tras investigarla. */
export interface ProspectResearch {
  state: JobState;
  queuedAt?: Date;
  startedAt?: Date;
  finishedAt?: Date;
  lockedUntil?: Date | null;
  attempts?: number;
  error?: string;
  steps?: ResearchStep[];
  place?: Record<string, unknown>;
  website?: Record<string, unknown>;
  pageSpeed?: Record<string, unknown>;
  social?: { network: string; url: string }[];
  searchResults?: { title: string; link: string; snippet?: string }[];
  emails?: string[];
  phones?: string[];
  people?: ProspectPerson[];
  ai?: Record<string, unknown>;
}

/** Material comercial generado para acercarse al prospecto. */
export interface ProspectMaterial {
  state: JobState;
  instructions?: string;
  queuedAt?: Date;
  lockedUntil?: Date | null;
  attempts?: number;
  error?: string;
  generatedAt?: Date;
  diagnosis?: Record<string, unknown>;
  plan?: Record<string, unknown>;
  outreach?: Record<string, unknown>;
}

@Schema({ timestamps: true, minimize: false })
export class Prospect extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ProspectSearch', index: true })
  searchId?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  website?: string;

  /** Dominio normalizado: sirve para no repetir la misma empresa. */
  @Prop({ trim: true, lowercase: true, index: true })
  domain?: string;

  @Prop({ trim: true }) phone?: string;
  @Prop({ trim: true, lowercase: true }) email?: string;
  @Prop({ trim: true }) address?: string;
  @Prop({ trim: true }) industry?: string;
  @Prop() description?: string;

  /** google_places, serper, ai o manual. */
  @Prop({ default: 'manual' })
  source: string;

  @Prop({ index: true }) placeId?: string;
  @Prop() rating?: number;
  @Prop() reviewsCount?: number;
  @Prop() mapsUrl?: string;

  /** Encaje con los servicios, 0–100, según la IA. */
  @Prop({ default: 0, index: true })
  fitScore: number;

  @Prop() fitReason?: string;

  @Prop({ type: String, enum: PROSPECT_STATUSES, default: 'new', index: true })
  status: ProspectStatus;

  @Prop({ type: Object, default: () => ({ state: 'idle' }) })
  research: ProspectResearch;

  @Prop({ type: Object, default: () => ({ state: 'idle' }) })
  material: ProspectMaterial;

  @Prop({ default: '' })
  notes: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  /** Contacto creado a partir de la empresa (o de una de sus personas). */
  @Prop({ type: Types.ObjectId, ref: 'Customer' })
  customerId?: Types.ObjectId;

  /** Oportunidad de seguimiento creada desde el prospecto. */
  @Prop({ type: Types.ObjectId, ref: 'Lead' })
  leadId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;
}

export const ProspectSchema = SchemaFactory.createForClass(Prospect);
ProspectSchema.index({ tenantId: 1, searchId: 1, fitScore: -1 });
ProspectSchema.index({ 'research.state': 1, 'research.lockedUntil': 1 });
ProspectSchema.index({ 'material.state': 1, 'material.lockedUntil': 1 });
