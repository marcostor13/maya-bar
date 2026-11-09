import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import type { ConversationChannel } from './conversation.schema';

export const BLOCK_SOURCES = ['inbox', 'manual', 'migration'] as const;
export type BlockSource = (typeof BLOCK_SOURCES)[number];

/**
 * Contacto bloqueado de una empresa. Vive aparte de la conversación para que
 * el bloqueo sobreviva a que el chat se elimine, y vale para todas las cuentas
 * del canal.
 */
@Schema({ timestamps: true, collection: 'blocked_contacts' })
export class BlockedContact extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({
    required: true,
    type: String,
    enum: ['whatsapp', 'instagram', 'messenger', 'email'],
  })
  channel: ConversationChannel;

  /** Identificador normalizado (ver `blockKey`). */
  @Prop({ required: true })
  identifier: string;

  /** Nombre con el que se vio al contacto, solo para mostrarlo. */
  @Prop()
  name?: string;

  @Prop()
  reason?: string;

  @Prop({ type: String, enum: BLOCK_SOURCES, default: 'inbox' })
  source: BlockSource;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  blockedBy?: Types.ObjectId;

  @Prop()
  blockedByName?: string;

  @Prop({ type: Types.ObjectId, ref: 'Customer' })
  customerId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Conversation' })
  conversationId?: Types.ObjectId;

  /** Cuenta de WhatsApp donde también se bloqueó en el proveedor. */
  @Prop({ type: Types.ObjectId })
  accountId?: Types.ObjectId;

  /** true si el bloqueo también quedó aplicado en WhatsApp. */
  @Prop()
  onChannel?: boolean;

  createdAt?: Date;
}

export const BlockedContactSchema =
  SchemaFactory.createForClass(BlockedContact);
BlockedContactSchema.index(
  { tenantId: 1, channel: 1, identifier: 1 },
  { unique: true },
);
