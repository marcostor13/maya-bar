import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'voice'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contact'
  | 'unsupported';

export type MessageStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed';

/** Quién originó el mensaje: el cliente, el agente IA, un operador humano o el sistema. */
export type MessageAuthor = 'customer' | 'agent' | 'human' | 'system';

@Schema({ timestamps: true })
export class Message extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true,
  })
  conversationId: Types.ObjectId;

  @Prop({ required: true, enum: ['in', 'out'] })
  direction: string;

  @Prop({ required: true, enum: ['customer', 'agent', 'human', 'system'] })
  author: MessageAuthor;

  @Prop({
    required: true,
    enum: [
      'text',
      'image',
      'video',
      'audio',
      'voice',
      'document',
      'sticker',
      'location',
      'contact',
      'unsupported',
    ],
    default: 'text',
  })
  type: MessageType;

  /** Texto del mensaje o caption del adjunto. */
  @Prop({ default: '' })
  text: string;

  // --- Adjunto (ya re-hospedado en S3) ---
  @Prop() mediaUrl?: string;
  @Prop() mediaKey?: string;
  @Prop() mimeType?: string;
  @Prop() filename?: string;
  @Prop() size?: number;
  @Prop() durationSeconds?: number;

  // --- Ubicación ---
  @Prop() latitude?: number;
  @Prop() longitude?: number;
  @Prop() locationName?: string;

  /** id del mensaje en el proveedor (wamid / id de WAHA) — usado para los acks. */
  @Prop({ index: true })
  externalId?: string;

  @Prop({
    enum: ['pending', 'sent', 'delivered', 'read', 'failed'],
    default: 'sent',
  })
  status: MessageStatus;

  @Prop()
  error?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  sentBy?: Types.ObjectId;

  @Prop({ type: Date, default: Date.now, index: true })
  at: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index({ conversationId: 1, at: -1 });
