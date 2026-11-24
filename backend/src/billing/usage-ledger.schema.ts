import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const AI_ACTIONS = [
  'agent_reply',
  'media',
  'recovery',
  'prospecting',
  'text',
  'scoring',
  'voice',
] as const;
export type AiAction = (typeof AI_ACTIONS)[number];

/** Créditos por acción (HU43). */
export const CREDIT_COSTS: Record<AiAction, number> = {
  agent_reply: 1,
  media: 2,
  recovery: 3,
  prospecting: 10,
  text: 1,
  scoring: 1,
  /** Agente de voz (HU73): por minuto de llamada (`units` = minutos). */
  voice: 5,
};

/** Un consumo de IA de una empresa (HU43). Nunca se edita: solo se añade. */
@Schema({
  collection: 'usage_ledger',
  timestamps: { createdAt: 'at', updatedAt: false },
})
export class UsageLedger extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: Types.ObjectId;

  /** Mes UTC `AAAA-MM`. */
  @Prop({ required: true })
  period: string;

  @Prop({ type: String, enum: AI_ACTIONS, required: true })
  action: AiAction;

  /** Créditos descontados (0 con keys propias). */
  @Prop({ required: true, default: 0 })
  credits: number;

  /** De esos créditos, cuántos salieron de recargas compradas. */
  @Prop({ default: 0 })
  fromPurchased: number;

  /** La llamada usó la API key de la empresa. */
  @Prop({ default: false })
  byok: boolean;

  @Prop()
  provider?: string;

  @Prop()
  aiModel?: string;

  @Prop({ default: 0 })
  inputTokens: number;

  @Prop({ default: 0 })
  outputTokens: number;

  /** Unidades cobradas en la llamada (p. ej. conversaciones clasificadas en recuperación). */
  @Prop({ default: 1 })
  units: number;

  /** Costo estimado para Maya en US$ (0 con keys propias; ver `ai-cost.ts`). */
  @Prop({ default: 0 })
  costUsd: number;

  at?: Date;
}

export const UsageLedgerSchema = SchemaFactory.createForClass(UsageLedger);
UsageLedgerSchema.index({ tenantId: 1, period: 1 });
