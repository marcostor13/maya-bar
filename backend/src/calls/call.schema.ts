import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const CALL_STATUSES = [
  'ringing',
  'connecting',
  'active',
  'completed',
  'missed',
  'rejected',
  'blocked',
  'failed',
] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];

/** Estados en los que la llamada ya terminó y no cambia más. */
export const FINAL_STATUSES: readonly CallStatus[] = [
  'completed',
  'missed',
  'rejected',
  'blocked',
  'failed',
];

export type CallDirection = 'inbound' | 'outbound';

/** Una llamada de voz de WhatsApp (Calling API de Cloud API). */
@Schema({ timestamps: true, collection: 'calls' })
export class Call extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'WhatsAppAccount', required: true })
  accountId: Types.ObjectId;

  /** Id de Meta (`wacid.…`). Hace idempotentes los webhooks repetidos. */
  @Prop({ required: true, unique: true })
  waCallId: string;

  @Prop({ type: String, required: true, enum: ['inbound', 'outbound'] })
  direction: CallDirection;

  @Prop({
    type: String,
    required: true,
    enum: CALL_STATUSES,
    default: 'ringing',
  })
  status: CallStatus;

  /** Teléfono (dígitos) o BSUID del cliente. */
  @Prop({ required: true })
  contact: string;

  @Prop() contactName?: string;

  @Prop({ type: Types.ObjectId, ref: 'Customer' })
  customerId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Conversation' })
  conversationId?: Types.ObjectId;

  /** Quien reservó la entrante (aceptando) o inició la saliente. */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  claimedBy?: Types.ObjectId;

  @Prop() claimedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  answeredBy?: Types.ObjectId;

  @Prop() answeredByName?: string;

  @Prop({ required: true })
  startedAt: Date;

  @Prop() connectedAt?: Date;
  @Prop() endedAt?: Date;
  @Prop() durationSec?: number;

  /** Detalle del final: `timeout`, `blocked`, `user_hangup`, código de Meta… */
  @Prop() endReason?: string;

  /** Oferta SDP de Meta. Solo mientras suena: se borra al aceptar o terminar. */
  @Prop({ select: false })
  offerSdp?: string;

  /** Ya se registró en la ficha y en el chat (los webhooks se repiten). */
  @Prop({ default: false })
  logged: boolean;

  /** El mensaje automático de llamada perdida ya se envió. */
  @Prop({ default: false })
  missedReplySent: boolean;
}

export const CallSchema = SchemaFactory.createForClass(Call);
CallSchema.index({ tenantId: 1, startedAt: -1 });
CallSchema.index({ status: 1, startedAt: 1 });
