import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  SUGGESTION_ACTIONS,
  type PromptSuggestion,
} from './prompt-review.logic';

export const PROMPT_VERSION_SOURCES = [
  'manual',
  'suggestion',
  'restore',
] as const;
export type PromptVersionSource = (typeof PROMPT_VERSION_SOURCES)[number];

/** Texto que tenía el prompt justo antes de un cambio. */
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class AgentPromptVersion extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'AiAgent', required: true })
  agentId: Types.ObjectId;

  @Prop({ required: true })
  prompt: string;

  /** Qué cambio lo reemplazó. */
  @Prop({ type: String, required: true, enum: PROMPT_VERSION_SOURCES })
  source: PromptVersionSource;

  @Prop()
  note?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  createdAt: Date;
}

export const AgentPromptVersionSchema =
  SchemaFactory.createForClass(AgentPromptVersion);
AgentPromptVersionSchema.index({ agentId: 1, createdAt: -1 });

/** Análisis de conversaciones con las sugerencias para el prompt. */
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class AgentPromptReview extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'AiAgent', required: true })
  agentId: Types.ObjectId;

  @Prop({ required: true })
  days: number;

  @Prop({ required: true })
  conversationsAnalyzed: number;

  @Prop({ default: '' })
  summary: string;

  @Prop({
    type: [
      {
        _id: false,
        title: String,
        problem: String,
        evidence: [{ _id: false, conversationId: String, excerpt: String }],
        action: { type: String, enum: SUGGESTION_ACTIONS },
        find: String,
        text: String,
        status: {
          type: String,
          enum: ['pending', 'applied', 'discarded'],
          default: 'pending',
        },
      },
    ],
    default: [],
  })
  suggestions: PromptSuggestion[];

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  createdAt: Date;
}

export const AgentPromptReviewSchema =
  SchemaFactory.createForClass(AgentPromptReview);
AgentPromptReviewSchema.index({ agentId: 1, createdAt: -1 });
