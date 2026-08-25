import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ConversationChannel = 'whatsapp' | 'instagram';

@Schema({ timestamps: true })
export class Conversation extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({
    required: true,
    enum: ['whatsapp', 'instagram'],
    default: 'whatsapp',
  })
  channel: ConversationChannel;

  /** Cuenta (WhatsAppAccount o InstagramAccount) por la que entra/sale el chat. */
  @Prop({ type: Types.ObjectId, required: true, index: true })
  accountId: Types.ObjectId;

  /** Último agente que respondió (informativo). */
  @Prop({ type: Types.ObjectId, ref: 'AiAgent' })
  agentId?: Types.ObjectId;

  /** Identificador del cliente: número normalizado (WA) o IGSID (Instagram). */
  @Prop({ required: true, index: true })
  contact: string;

  /** chatId crudo del proveedor (ej. 5219991234567@c.us) para responder sin reconstruirlo. */
  @Prop()
  chatId?: string;

  @Prop()
  contactName?: string;

  @Prop()
  contactAvatar?: string;

  @Prop({ type: Date, default: Date.now, index: true })
  lastMessageAt: Date;

  @Prop({ default: '' })
  lastMessagePreview: string;

  @Prop({ enum: ['in', 'out'], default: 'in' })
  lastMessageDirection: string;

  @Prop({ default: 0 })
  unreadCount: number;

  /** Si está en true responde el agente IA; en false el chat está en modo manual. */
  @Prop({ default: true })
  autoReply: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  takenOverBy?: Types.ObjectId;

  @Prop({ type: Date })
  takenOverAt?: Date;

  @Prop({ enum: ['open', 'closed'], default: 'open' })
  status: string;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);
ConversationSchema.index({ tenantId: 1, lastMessageAt: -1 });
ConversationSchema.index(
  { channel: 1, accountId: 1, contact: 1 },
  { unique: true },
);
