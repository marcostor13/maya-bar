import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class EventRegistration extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Event', required: true, index: true })
  eventId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  email: string;

  @Prop()
  phone?: string;

  @Prop({ default: 1 })
  partySize: number;

  @Prop({ required: true, unique: true })
  ticketCode: string;

  @Prop({ enum: ['confirmed', 'cancelled'], default: 'confirmed' })
  status: string;

  @Prop({ default: false })
  checkedIn: boolean;

  @Prop()
  checkedInAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  impulsadorId?: Types.ObjectId;

  @Prop()
  impulsadorCode?: string;

  @Prop({ type: Object, default: {} })
  customFields: Record<string, string>;
}

export const EventRegistrationSchema =
  SchemaFactory.createForClass(EventRegistration);
