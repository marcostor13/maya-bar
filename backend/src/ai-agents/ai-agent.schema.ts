import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class AiAgent extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ required: true })
  systemPrompt: string;

  @Prop({ enum: ['auto', 'openai', 'claude', 'deepseek', 'gemini'], default: 'auto' })
  provider: string;

  @Prop()
  aiModel?: string;

  @Prop({ default: 0.4 })
  temperature: number;

  @Prop({ default: 800 })
  maxTokens: number;

  @Prop()
  greeting?: string; // saludo inicial opcional

  @Prop({ default: 'Lo siento, no tengo esa información en este momento.' })
  fallbackMessage: string;

  @Prop({ default: true })
  ragEnabled: boolean;

  @Prop({ default: 5 })
  topK: number;

  // Cuentas de WhatsApp por las que responde
  @Prop({ type: [{ type: Types.ObjectId, ref: 'WhatsAppAccount' }], default: [] })
  accountIds: Types.ObjectId[];

  @Prop({ default: false })
  published: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;
}

export const AiAgentSchema = SchemaFactory.createForClass(AiAgent);
