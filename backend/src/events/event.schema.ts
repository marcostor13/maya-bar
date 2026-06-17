import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EventStatus = 'draft' | 'published' | 'cancelled';
export type FormFieldType = 'text' | 'textarea' | 'select' | 'checkbox' | 'number' | 'email' | 'phone' | 'date';

export interface EventMediaFile {
  url: string;
  key: string;
  name: string;
  mimeType: string;
  size: number;
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
    type: [{
      url: { type: String, required: true },
      key: { type: String, required: true },
      name: { type: String, required: true },
      mimeType: { type: String, required: true },
      size: { type: Number, required: true },
    }],
    default: [],
  })
  mediaFiles: EventMediaFile[];

  @Prop({
    type: [{
      id: { type: String, required: true },
      label: { type: String, required: true },
      type: { type: String, required: true },
      required: { type: Boolean, default: false },
      options: [String],
    }],
    default: [],
  })
  formFields: EventFormField[];

  @Prop({ type: Object, default: null })
  invitationDesign?: Record<string, unknown>;
}

export const EventSchema = SchemaFactory.createForClass(Event);
