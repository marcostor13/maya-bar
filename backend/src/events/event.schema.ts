import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EventStatus = 'draft' | 'published' | 'cancelled';
export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'checkbox'
  | 'number'
  | 'email'
  | 'phone'
  | 'date';

export interface EventMediaFile {
  url: string;
  key: string;
  name: string;
  mimeType: string;
  size: number;
}

/** Tipo de entrada con cupo y fecha de corte propios (HU67). */
export interface EventTicketType {
  key: string;
  name: string;
  price: number;
  /** 0 = sin tope propio. */
  capacity: number;
  /** Después de esta fecha ya no se vende (preventa). */
  salesEndAt?: Date | null;
  /** Vendidas o reservadas en pago pendiente. Lo mueve el servidor. */
  sold: number;
}

export interface EventFormField {
  id: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  options: string[];
}

@Schema({ timestamps: true })
export class Event extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Local', required: true, index: true })
  localId: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop()
  description?: string;

  /** Lugar propio del evento; vacío = la dirección del local (HU33). */
  @Prop()
  location?: string;

  @Prop({ required: true })
  date: Date;

  @Prop()
  startTime?: string;

  @Prop()
  endTime?: string;

  @Prop({ default: 0 })
  capacity: number;

  @Prop({ default: 0 })
  price: number;

  @Prop()
  imageUrl?: string;

  @Prop({ enum: ['draft', 'published', 'cancelled'], default: 'draft' })
  status: EventStatus;

  @Prop({ unique: true, sparse: true })
  slug?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  createdBy?: Types.ObjectId;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  sharedWith: Types.ObjectId[];

  @Prop({ default: false })
  sharedWithAll: boolean;

  @Prop({
    type: [
      {
        url: { type: String, required: true },
        key: { type: String, required: true },
        name: { type: String, required: true },
        mimeType: { type: String, required: true },
        size: { type: Number, required: true },
      },
    ],
    default: [],
  })
  mediaFiles: EventMediaFile[];

  @Prop({
    type: [
      {
        id: { type: String, required: true },
        label: { type: String, required: true },
        type: { type: String, required: true },
        required: { type: Boolean, default: false },
        options: [String],
      },
    ],
    default: [],
  })
  formFields: EventFormField[];

  @Prop({ type: Object, default: null })
  invitationDesign?: Record<string, unknown>;

  /** Cobro de la entrada en línea con el Mercado Pago de la empresa (HU67). */
  @Prop({ default: false })
  onlinePayment: boolean;

  @Prop({ default: 'PEN' })
  currency: string;

  @Prop({
    type: [
      {
        _id: false,
        key: { type: String, required: true },
        name: { type: String, required: true },
        price: { type: Number, required: true, min: 0 },
        capacity: { type: Number, default: 0, min: 0 },
        salesEndAt: { type: Date, default: null },
        sold: { type: Number, default: 0, min: 0 },
      },
    ],
    default: [],
  })
  ticketTypes: EventTicketType[];
}

export const EventSchema = SchemaFactory.createForClass(Event);
