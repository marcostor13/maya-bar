import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const RESERVATION_STATUSES = [
  'pending',
  'confirmed',
  'cancelled',
  'no-show',
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const OCCASIONS = [
  'birthday',
  'anniversary',
  'business',
  'other',
] as const;
export type Occasion = (typeof OCCASIONS)[number];

export interface StatusEntry {
  status: ReservationStatus;
  at: Date;
  note?: string;
}

@Schema({ timestamps: true })
export class Reservation extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Local', required: true, index: true })
  localId: Types.ObjectId;

  @Prop({ required: true })
  date: string; // 'YYYY-MM-DD'

  @Prop({ required: true })
  turno: string; // 'HH:MM'

  @Prop({ required: true, min: 1 })
  partySize: number;

  @Prop({ required: true })
  guestName: string;

  @Prop({ required: true })
  guestEmail: string;

  @Prop()
  guestPhone?: string;

  @Prop({ type: String, enum: OCCASIONS })
  occasion?: Occasion;

  @Prop()
  notes?: string;

  @Prop({
    type: String,
    default: 'pending',
    enum: RESERVATION_STATUSES,
    index: true,
  })
  status: ReservationStatus;

  @Prop({ type: [Object], default: [] })
  statusHistory: StatusEntry[];

  @Prop({ required: true, unique: true, index: true })
  confirmationToken: string;

  @Prop({ default: false })
  reminderSent: boolean;

  @Prop({ default: false })
  confirmationRequested: boolean;
}

export const ReservationSchema = SchemaFactory.createForClass(Reservation);
