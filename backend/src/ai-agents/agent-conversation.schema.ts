import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: false })
export class ConvMessage {
  @Prop({ required: true, enum: ['user', 'assistant'] })
  role: string;

  @Prop({ required: true })
  content: string;

  @Prop({ type: Date, default: Date.now })
  at: Date;
}
const ConvMessageSchema = SchemaFactory.createForClass(ConvMessage);

@Schema({ timestamps: true })
export class AgentConversation extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'AiAgent', required: true, index: true })
  agentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'WhatsAppAccount', index: true })
  accountId?: Types.ObjectId;

  @Prop({ required: true, index: true })
  contact: string; // número/chatId del cliente

  @Prop({ type: [ConvMessageSchema], default: [] })
  messages: ConvMessage[];
}

export const AgentConversationSchema = SchemaFactory.createForClass(AgentConversation);
AgentConversationSchema.index({ agentId: 1, contact: 1 });
