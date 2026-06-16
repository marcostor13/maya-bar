import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Customer extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, lowercase: true, trim: true })
  email: string;

  @Prop()
  phone?: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop()
  notes?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  createdBy?: Types.ObjectId;

  @Prop({ enum: ['reservation', 'event', 'manual'], default: 'manual' })
  source: string;

  @Prop({ default: 0 })
  totalReservations: number;

  @Prop({ default: 0 })
  totalEvents: number;

  @Prop()
  lastVisit?: Date;
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);
// Unique per (email, tenant, owner) — impulsadores have their own contact pools
CustomerSchema.index({ email: 1, tenantId: 1, createdBy: 1 }, { unique: true });
