import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import type {
  AutomationStep,
  AutomationTrigger,
  SendWindow,
} from './automation-steps';

/** Regla "cuando pase X, espera y haz Y" de una empresa (HU58). */
@Schema({ timestamps: true, collection: 'automations' })
export class Automation extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: false })
  active: boolean;

  @Prop({ type: Object, required: true })
  trigger: AutomationTrigger;

  @Prop({ type: [Object], default: [] })
  steps: AutomationStep[];

  /** Sale de la secuencia en cuanto el contacto responde. */
  @Prop({ default: true })
  exitOnReply: boolean;

  /** Horario de envío en Lima; vacío = a cualquier hora. */
  @Prop({ type: Object })
  sendWindow?: SendWindow;

  /** Secreto con el que se firman los pasos de webhook (HMAC SHA-256). */
  @Prop()
  webhookSecret?: string;

  /** Plantilla de la que salió, si alguna. */
  @Prop()
  templateKey?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export const AutomationSchema = SchemaFactory.createForClass(Automation);
AutomationSchema.index({ tenantId: 1, active: 1, 'trigger.type': 1 });

export const RUN_STATUSES = ['active', 'completed', 'exited'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
export type ExitReason =
  | 'replied'
  | 'suppressed'
  | 'left_rule'
  | 'condition'
  | 'paused'
  | 'deleted'
  | 'no_contact';

export interface RunLogEntry {
  stepId?: string;
  type: string;
  at: Date;
  result: 'ok' | 'skipped' | 'failed' | 'exit';
  detail?: string;
}

/** Estado de un contacto dentro de una automatización. */
@Schema({ timestamps: true, collection: 'automation_runs' })
export class AutomationRun extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Automation', required: true })
  automationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Customer', required: true })
  customerId: Types.ObjectId;

  @Prop({ type: String, enum: RUN_STATUSES, default: 'active' })
  status: RunStatus;

  /** Índice del próximo paso a ejecutar. */
  @Prop({ default: 0 })
  stepIndex: number;

  @Prop({ type: Date, required: true })
  nextAt: Date;

  @Prop({ type: Date, required: true })
  enrolledAt: Date;

  @Prop({ type: Date })
  finishedAt?: Date;

  @Prop()
  exitReason?: ExitReason;

  /** Respondió en algún momento de la secuencia (métrica). */
  @Prop({ default: false })
  replied: boolean;

  /** Datos del disparador: formulario, oportunidad, evento… */
  @Prop({ type: Object, default: {} })
  context: {
    formId?: string;
    leadId?: string;
    eventId?: string;
    registrationId?: string;
    conversationId?: string;
    campaignId?: string;
    url?: string;
  };

  @Prop({ type: [Object], default: [] })
  log: RunLogEntry[];

  @Prop({ type: Date })
  lockedUntil?: Date;
}

export const AutomationRunSchema = SchemaFactory.createForClass(AutomationRun);
// Una sola ejecución activa por contacto y regla: inscribir es idempotente.
AutomationRunSchema.index(
  { automationId: 1, customerId: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } },
);
AutomationRunSchema.index({ status: 1, nextAt: 1 });
AutomationRunSchema.index({ tenantId: 1, customerId: 1, status: 1 });
AutomationRunSchema.index({ automationId: 1, status: 1 });
