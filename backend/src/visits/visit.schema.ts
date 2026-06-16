import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export interface GeoLocation {
  lat: number;
  lng: number;
  accuracy?: number;
}

@Schema({ timestamps: true })
export class Visit extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  impulsadorId: Types.ObjectId;

  @Prop({ required: true })
  reference: string;

  @Prop({ type: { lat: Number, lng: Number, accuracy: Number }, required: true })
  location: GeoLocation;

  @Prop()
  address?: string;
}

export const VisitSchema = SchemaFactory.createForClass(Visit);
