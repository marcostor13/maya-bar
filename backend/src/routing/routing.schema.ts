import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import type { RoutingMode } from './routing-pick';

export const ROUTING_MODES: RoutingMode[] = [
  'round_robin',
  'least_open',
  'weighted',
];
export const ROUTING_TARGETS = ['leads', 'contacts', 'both'] as const;
export type RoutingTarget = (typeof ROUTING_TARGETS)[number];
export const MATCH_KINDS = [
  'any',
  'contact_source',
  'form',
  'lead_source',
] as const;
export type MatchKind = (typeof MATCH_KINDS)[number];

export interface RoutingMember {
  userId: Types.ObjectId;
  weight: number;
}

/** Regla de reparto automático (HU59): de dónde viene, a quién y cómo. */
@Schema({ timestamps: true, collection: 'routing_rules' })
export class RoutingRule extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: true })
  active: boolean;

  /** Se aplica la primera regla activa que coincide, por este orden. */
  @Prop({ default: 0 })
  order: number;

  @Prop({ type: String, enum: ROUTING_TARGETS, default: 'leads' })
  appliesTo: RoutingTarget;

  @Prop({ type: Object, default: { kind: 'any' } })
  match: { kind: MatchKind; value?: string };

  @Prop({ type: String, enum: ROUTING_MODES, default: 'round_robin' })
  mode: RoutingMode;

  @Prop({
    type: [
      {
        userId: { type: Types.ObjectId, ref: 'User' },
        weight: { type: Number, default: 1 },
      },
    ],
    default: [],
  })
  members: RoutingMember[];

  /** Último índice que recibió en el turno rotativo. */
  @Prop({ default: -1 })
  cursor: number;

  /** Minutos para responder una oportunidad; vacío = sin límite. */
  @Prop()
  responseMinutes?: number;

  @Prop({ type: String, enum: ['next', 'pool'], default: 'next' })
  onTimeout: 'next' | 'pool';
}

export const RoutingRuleSchema = SchemaFactory.createForClass(RoutingRule);
RoutingRuleSchema.index({ tenantId: 1, active: 1, order: 1 });

export type AssignmentReason =
  | 'auto'
  | 'owner'
  | 'timeout_next'
  | 'timeout_pool'
  | 'no_one';

/** Bitácora de cada asignación automática y su tiempo de respuesta. */
@Schema({ timestamps: true, collection: 'routing_assignments' })
export class RoutingAssignment extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'RoutingRule' })
  ruleId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Lead' })
  leadId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Customer' })
  customerId?: Types.ObjectId;

  /** Vacío = quedó en la bolsa. */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  userId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  fromUserId?: Types.ObjectId;

  @Prop({ required: true })
  reason: AssignmentReason;

  @Prop({ type: Date, required: true })
  at: Date;

  /** Seguimiento del tiempo de respuesta (solo oportunidades con límite). */
  @Prop({
    type: String,
    enum: ['pending', 'answered', 'expired', 'none'],
    default: 'none',
  })
  status: 'pending' | 'answered' | 'expired' | 'none';

  @Prop({ type: Date })
  dueAt?: Date;

  @Prop()
  detail?: string;
}

export const RoutingAssignmentSchema =
  SchemaFactory.createForClass(RoutingAssignment);
RoutingAssignmentSchema.index({ status: 1, dueAt: 1 });
RoutingAssignmentSchema.index({ tenantId: 1, at: -1 });
RoutingAssignmentSchema.index({ ruleId: 1, userId: 1 });
