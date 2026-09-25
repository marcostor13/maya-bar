import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const CALENDAR_PROVIDERS = ['google', 'microsoft'] as const;
export type CalendarProvider = (typeof CALENDAR_PROVIDERS)[number];

/**
 * Calendario conectado por OAuth: Google Calendar (enlaces de Meet) o
 * Microsoft 365 (enlaces de Teams). Una empresa puede tener varios; el
 * predeterminado es el que se usa al agendar sin elegir otro.
 *
 * Los tokens se guardan cifrados (`SecretBox`) y nunca salen en la API.
 */
@Schema({ timestamps: true })
export class CalendarConnection extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: String, enum: CALENDAR_PROVIDERS, required: true })
  provider: CalendarProvider;

  /** Cuenta dueña del calendario: organizadora de las reuniones. */
  @Prop({ required: true, trim: true, lowercase: true })
  email: string;

  @Prop({ trim: true })
  name?: string;

  @Prop({ select: false }) accessTokenEnc?: string;
  @Prop({ select: false }) refreshTokenEnc?: string;
  @Prop({ type: Date }) expiresAt?: Date;

  @Prop({ default: false })
  isDefault: boolean;

  /** Usuario de la plataforma que autorizó la conexión. */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  connectedBy?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CalendarConnectionSchema =
  SchemaFactory.createForClass(CalendarConnection);
CalendarConnectionSchema.index(
  { tenantId: 1, provider: 1, email: 1 },
  { unique: true },
);
