import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import type { AdReferral } from '../shared/ad-referral';

export type ConversationChannel =
  | 'whatsapp'
  | 'instagram'
  | 'messenger'
  | 'email';

@Schema({ timestamps: true })
export class Conversation extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({
    required: true,
    type: String,
    enum: ['whatsapp', 'instagram', 'messenger', 'email'],
    default: 'whatsapp',
  })
  channel: ConversationChannel;

  /** Cuenta (WhatsApp, Instagram, Messenger o correo) por la que entra/sale el chat. */
  @Prop({ type: Types.ObjectId, required: true, index: true })
  accountId: Types.ObjectId;

  /** Último agente que respondió (informativo). */
  @Prop({ type: Types.ObjectId, ref: 'AiAgent' })
  agentId?: Types.ObjectId;

  /** Identificador del cliente: número normalizado (WA), IGSID (Instagram), PSID (Messenger) o dirección de correo. */
  @Prop({ required: true, index: true })
  contact: string;

  /** chatId crudo del proveedor (ej. 5219991234567@c.us) para responder sin reconstruirlo. */
  @Prop()
  chatId?: string;

  @Prop()
  contactName?: string;

  /** Solo Messenger e Instagram; WhatsApp Cloud API no expone la foto. */
  @Prop()
  contactAvatar?: string;

  /**
   * Cuándo se trajo la foto. Las URLs de Meta llevan firma temporal, así que
   * pasada la ventana se vuelve a pedir el perfil; sin esta marca habría que
   * elegir entre llamar a Meta en cada mensaje o dejar avatares rotos.
   */
  @Prop({ type: Date })
  contactAvatarAt?: Date;

  @Prop({ type: Date, default: Date.now, index: true })
  lastMessageAt: Date;

  @Prop({ default: '' })
  lastMessagePreview: string;

  /** Correo: asunto del último mensaje del hilo, para mostrarlo y responder con "Re:". */
  @Prop()
  emailSubject?: string;

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

  /**
   * Anuncio del que salió el chat (Click-to-WhatsApp). Se graba con el primer
   * mensaje y NO se pisa después: la atribución es del anuncio que trajo al
   * cliente, no del último que volvió a tocar.
   */
  @Prop({ type: Object })
  adReferral?: AdReferral;

  /** Contacto del CRM al que se guardó esta conversación, si se guardó. */
  @Prop({ type: Types.ObjectId, ref: 'Customer', index: true })
  customerId?: Types.ObjectId;

  // --- Escalamiento a un agente humano ---

  /** true desde que el agente IA deriva el chat hasta que alguien lo reactiva. */
  @Prop({ default: false, index: true })
  escalated: boolean;

  @Prop({ type: Date })
  escalatedAt?: Date;

  /** Motivo que dio el agente IA al derivar. */
  @Prop()
  escalationReason?: string;

  /** Números a los que se les avisó por WhatsApp. */
  @Prop({ type: [String], default: [] })
  escalationNotifiedTo: string[];
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);
ConversationSchema.index({ tenantId: 1, lastMessageAt: -1 });
ConversationSchema.index(
  { channel: 1, accountId: 1, contact: 1 },
  { unique: true },
);
