import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Plan de recuperación de clientes: el asistente de cuatro pasos guarda aquí
 * todo su estado, así que se puede cerrar la pantalla y retomarlo después.
 *
 *  analyzing → review → templates → scheduled → sending → done
 *
 * Segmentos y destinatarios van embebidos (no en colecciones aparte): un plan
 * se edita, se envía y se consulta siempre entero, y nunca pasa de unos
 * cientos de personas.
 */
export type RecoveryStatus =
  | 'analyzing'
  | 'review'
  | 'templates'
  | 'scheduled'
  | 'sending'
  | 'done'
  | 'failed';

/** Clasificación de cada conversación. Las cuatro primeras son recuperables. */
export type RecoveryStage =
  | 'interesado'
  | 'objecion'
  | 'vio_precio'
  | 'sin_conversacion'
  | 'cliente'
  | 'no_encaja'
  | 'no_contactar'
  | 'en_curso';

export type RecipientSendStatus = 'pending' | 'sent' | 'failed' | 'skipped';

export interface RecoveryRecipient {
  conversationId: string;
  customerId?: string;
  name: string;
  phone: string;
  lastMessageAt: Date;
  stage: RecoveryStage;
  /** Lo que la IA entendió de la conversación, en una frase. */
  note: string;
  /** Escribió en las últimas 24 h: Meta aún admite texto libre. */
  insideWindow: boolean;
  /** Solo en los excluidos: por qué quedó fuera. */
  reason?: string;
  sendStatus?: RecipientSendStatus;
  sentAt?: Date;
  error?: string;
}

export type SegmentSendStatus =
  | 'idle'
  | 'scheduled'
  | 'sending'
  | 'paused'
  | 'done';

export interface RecoverySegment {
  key: string;
  name: string;
  description: string;
  /** Por qué se les escribe así. */
  strategy: string;
  color: string;
  enabled: boolean;
  recipients: RecoveryRecipient[];
  /** Cuerpo de la plantilla, con {{1}} para el nombre. */
  message: string;

  templateName?: string;
  templateId?: string;
  /** Mensaje con el que se creó la plantilla, para detectar ediciones. */
  templateBody?: string;
  templateStatus?: string;
  rejectedReason?: string;
  /** Error al crear/editar la plantilla en Meta (no es un rechazo de revisión). */
  templateError?: string;

  recommendedAt?: Date;
  recommendationReason?: string;
  sendAt?: Date;
  firstBatchSize: number;
  firstPauseMinutes: number;
  batchSize: number;
  batchIntervalMinutes: number;
  sendStatus: SegmentSendStatus;
  nextBatchAt?: Date;
  sendError?: string;
}

export interface RecoveryAnalysis {
  total: number;
  processed: number;
  analyzedAt?: Date;
  headline: string;
  summary: string;
  insights: string[];
  /** Mensajes entrantes por hora local (24 posiciones). */
  hourHistogram: number[];
  bestHour?: number;
  insideWindow: number;
  error?: string;
}

@Schema({ timestamps: true })
export class RecoveryPlan extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({
    enum: [
      'analyzing',
      'review',
      'templates',
      'scheduled',
      'sending',
      'done',
      'failed',
    ],
    default: 'analyzing',
  })
  status: RecoveryStatus;

  @Prop({ default: 30 })
  lookbackDays: number;

  /** Qué se ofrece, fecha límite, quién firma… lo que el usuario quiera que la IA sepa. */
  @Prop({ default: '' })
  context: string;

  @Prop({ default: 'America/Lima' })
  timezone: string;

  @Prop({ default: 'es' })
  language: string;

  /** Cuenta Cloud API donde viven las plantillas del plan. */
  @Prop({ type: Types.ObjectId })
  accountId?: Types.ObjectId;

  @Prop({ type: Object, default: () => ({}) })
  analysis: RecoveryAnalysis;

  @Prop({ type: Array, default: [] })
  segments: RecoverySegment[];

  @Prop({ type: Array, default: [] })
  excluded: RecoveryRecipient[];

  /** Candado del cron de envío, para que dos instancias no manden la misma tanda. */
  @Prop({ type: Date })
  lockedUntil?: Date;

  /** Última vez que el cron pidió a Meta el estado de las plantillas. */
  @Prop({ type: Date })
  templatesSyncedAt?: Date;
}

export const RecoveryPlanSchema = SchemaFactory.createForClass(RecoveryPlan);
RecoveryPlanSchema.index({ status: 1 });
