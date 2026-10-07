import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const MESSAGE_TEMPLATE_CHANNELS = ['sms', 'whatsapp', 'email'] as const;
export type MessageTemplateChannel = (typeof MESSAGE_TEMPLATE_CHANNELS)[number];

/**
 * Texto reutilizable con variables (`{nombre}`, `{link}`…) para SMS, WhatsApp
 * o el cuerpo en texto de un email. No confundir con `WaTemplate`, que es el
 * espejo de las plantillas aprobadas por Meta.
 */
@Schema({ timestamps: true })
export class MessageTemplate extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({
    type: String,
    required: true,
    enum: MESSAGE_TEMPLATE_CHANNELS,
    default: 'sms',
  })
  channel: MessageTemplateChannel;

  /** Solo en `email`. */
  @Prop({ trim: true })
  subject?: string;

  @Prop({ required: true })
  body: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;
}

export const MessageTemplateSchema =
  SchemaFactory.createForClass(MessageTemplate);
MessageTemplateSchema.index({ tenantId: 1, channel: 1, name: 1 });
