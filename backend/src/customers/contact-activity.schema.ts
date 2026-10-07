import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/** Lo que un agente puede registrar a mano sobre un contacto. */
export const CONTACT_ACTIVITY_TYPES = [
  'note',
  'call',
  'whatsapp',
  'email',
  'sms',
  'meeting',
  'visit',
  'task',
] as const;

/** Lo que registra la plataforma sola: no se edita ni se borra. */
export const CONTACT_AUTO_ACTIVITY_TYPES = ['assignment', 'system'] as const;

export const ALL_CONTACT_ACTIVITY_TYPES = [
  ...CONTACT_ACTIVITY_TYPES,
  ...CONTACT_AUTO_ACTIVITY_TYPES,
] as const;

export type ContactActivityType = (typeof ALL_CONTACT_ACTIVITY_TYPES)[number];

/**
 * Bitácora de atención de un contacto: comentarios y acciones del agente, y
 * los cambios de responsable. Vive en el contacto (no en la oportunidad) para
 * que el historial siga ahí aunque no haya ninguna oportunidad abierta.
 */
@Schema({ timestamps: true })
export class ContactActivity extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Customer', required: true })
  customerId: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    enum: ALL_CONTACT_ACTIVITY_TYPES,
    default: 'note',
  })
  type: string;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ trim: true })
  body?: string;

  /** Cuándo ocurrió el contacto con el cliente (puede ser anterior al registro). */
  @Prop({ type: Date, default: Date.now })
  at: Date;

  /** Solo en `assignment`: de quién a quién pasó. Vacío = sin responsable. */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  fromUserId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  toUserId?: Types.ObjectId;

  /** Conversación desde la que se registró, si fue desde el inbox. */
  @Prop({ type: Types.ObjectId, ref: 'Conversation' })
  conversationId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;
}

export const ContactActivitySchema =
  SchemaFactory.createForClass(ContactActivity);
ContactActivitySchema.index({ tenantId: 1, customerId: 1, at: -1 });
