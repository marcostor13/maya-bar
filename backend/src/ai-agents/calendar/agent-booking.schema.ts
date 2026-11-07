import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Cita agendada por un agente IA. La agenda real vive en Google/Outlook; este
 * registro sirve para no duplicar citas y para que el equipo vea qué se agendó.
 */
@Schema({ timestamps: true, collection: 'agent_bookings' })
export class AgentBooking extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'AiAgent', required: true })
  agentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Conversation' })
  conversationId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'CalendarConnection' })
  connectionId?: Types.ObjectId;

  @Prop({ required: true })
  provider: string;

  /** Vacío mientras la reserva está pendiente de crear el evento. */
  @Prop()
  eventId?: string;

  @Prop({ required: true })
  start: Date;

  @Prop({ required: true })
  end: Date;

  @Prop({ required: true })
  title: string;

  @Prop()
  contactName?: string;

  @Prop()
  attendeeEmail?: string;

  @Prop()
  joinUrl?: string;

  @Prop()
  htmlLink?: string;

  @Prop({ default: 'confirmed', enum: ['pending', 'confirmed', 'cancelled'] })
  status: string;
}

export const AgentBookingSchema = SchemaFactory.createForClass(AgentBooking);
// Idempotencia: la misma conversación no agenda dos veces el mismo inicio.
AgentBookingSchema.index(
  { conversationId: 1, start: 1 },
  {
    unique: true,
    partialFilterExpression: { conversationId: { $type: 'objectId' } },
  },
);
AgentBookingSchema.index({ tenantId: 1, start: -1 });
