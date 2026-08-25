import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export interface SegmentRule {
  field:
    | 'tags'
    | 'source'
    | 'totalReservations'
    | 'totalEvents'
    | 'daysSinceLastVisit';
  operator: 'has_any' | 'has_all' | 'equals' | 'not_equals' | 'gte' | 'lte';
  value: string | number | string[];
}

@Schema({ timestamps: true })
export class ContactList extends Document {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ enum: ['static', 'dynamic'], default: 'static' })
  type: 'static' | 'dynamic';

  @Prop({
    type: [{ field: String, operator: String, value: Object }],
    default: [],
  })
  rules: SegmentRule[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Customer' }], default: [] })
  memberIds: Types.ObjectId[];

  @Prop({ default: 0 })
  memberCount: number;

  @Prop({ default: '#6366F1' })
  color: string;

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  createdBy?: Types.ObjectId;
}

export const ContactListSchema = SchemaFactory.createForClass(ContactList);
