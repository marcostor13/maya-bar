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

  // ── Pago en línea (HU67). Sin `paymentStatus` = registro gratuito o pago en el local.

  @Prop()
  ticketType?: string;

  @Prop()
  ticketTypeName?: string;

  @Prop()
  amount?: number;

  @Prop()
  currency?: string;

  /** Comisión de Maya en la venta. */
  @Prop()
  feeAmount?: number;

  @Prop({
    enum: ['pending', 'paid', 'rejected', 'refunded', 'expired'],
    index: true,
  })
  paymentStatus?: 'pending' | 'paid' | 'rejected' | 'refunded' | 'expired';

  @Prop()
  mpPreferenceId?: string;

  @Prop({ index: true, sparse: true })
  mpPaymentId?: string;

  @Prop()
  paidAt?: Date;

  /** Hasta cuándo se guarda el cupo de un pago pendiente. */
  @Prop()
  holdExpiresAt?: Date;
}

export const EventRegistrationSchema =
  SchemaFactory.createForClass(EventRegistration);
