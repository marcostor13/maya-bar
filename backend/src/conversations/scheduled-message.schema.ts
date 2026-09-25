import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import type { MessageType } from './message.schema';

export type ScheduledStatus =
  | 'pending'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'cancelled';

/**
 * Mensaje programado desde la bandeja. Guarda lo mismo que un envío manual y
 * el cron lo entrega a su hora por el mismo camino (`sendManual`), así que
 * sale con el canal, la cuenta y el formato de cualquier otro mensaje.
 */
@Schema({ timestamps: true })
export class ScheduledMessage extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true,
  })
  conversationId: Types.ObjectId;

  @Prop({ type: Date, required: true })
  sendAt: Date;

  @Prop({
    enum: ['pending', 'sending', 'sent', 'failed', 'cancelled'],
    default: 'pending',
  })
  status: ScheduledStatus;

  @Prop({ type: String, default: 'text' })
  type: MessageType;

  @Prop({ default: '' })
  text: string;

  @Prop()
  subject?: string;

  @Prop()
  mediaUrl?: string;

  @Prop()
  mediaKey?: string;

  @Prop()
  mimeType?: string;

  @Prop()
  filename?: string;

  @Prop()
  size?: number;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  /** Mensaje real creado al enviarlo. */
  @Prop({ type: Types.ObjectId, ref: 'Message' })
  messageId?: Types.ObjectId;

  @Prop()
  error?: string;
}

export const ScheduledMessageSchema =
  SchemaFactory.createForClass(ScheduledMessage);
// El cron busca los pendientes vencidos; la bandeja, los de un chat.
ScheduledMessageSchema.index({ status: 1, sendAt: 1 });
ScheduledMessageSchema.index({ conversationId: 1, status: 1, sendAt: 1 });
