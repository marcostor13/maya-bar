import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LocalType =
  | 'restaurant'
  | 'bar'
  | 'cafe'
  | 'cafeteria'
  | 'fastfood';

export interface BusinessHours {
  day: number; // 0=Sun, 1=Mon, ..., 6=Sat
  open: string; // '09:00'
  close: string; // '22:00'
  isClosed: boolean;
}

export interface ReservationConfig {
  enabled: boolean;
  turnos: string[]; // ['12:00','13:30','20:00','21:30']
  defaultDuration: number; // minutes per slot
  maxPerTurno: number; // max concurrent reservations per slot
  maxPartySize: number;
  advanceBookingDays: number;
  welcomeTitle?: string;
  welcomeMessage?: string;
  policy?: string;
}

@Schema({ timestamps: true })
export class Local extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ default: 'restaurant' })
  type: LocalType;

  @Prop()
  address?: string;

  @Prop()
  phone?: string;

  @Prop()
  email?: string;

  @Prop()
  timezone: string;

  @Prop({ type: [Object], default: [] })
  hours: BusinessHours[];

  @Prop({ default: 0 })
  tableCount: number;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({
    type: Object,
    default: () => ({
      enabled: false,
      turnos: [],
      defaultDuration: 90,
      maxPerTurno: 4,
      maxPartySize: 10,
      advanceBookingDays: 30,
      welcomeTitle: 'Reserva en Maya',
      welcomeMessage:
        '¡Te esperamos! Completa tus datos para asegurar tu mesa.',
      policy: 'Cancelaciones permitidas hasta 24 horas antes.',
    }),
  })
  reservationConfig: ReservationConfig;
}

export const LocalSchema = SchemaFactory.createForClass(Local);
