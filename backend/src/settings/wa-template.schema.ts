import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TemplateStatus = 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED';
export type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

@Schema({ timestamps: true })
export class WaTemplate extends Document {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true })
  metaId: string;

  @Prop({ required: true })
  name: string;

  @Prop({ enum: ['MARKETING', 'UTILITY', 'AUTHENTICATION'] })
  category: TemplateCategory;

  @Prop({ required: true })
  language: string;

  @Prop({
    enum: ['APPROVED', 'PENDING', 'REJECTED', 'PAUSED'],
    default: 'PENDING',
  })
  status: TemplateStatus;

  @Prop()
  headerType?: string;

  @Prop()
  headerText?: string;

  @Prop({ required: true })
  body: string;

  @Prop()
  footer?: string;

  @Prop({ type: Object })
  rawComponents?: object[];
}

export const WaTemplateSchema = SchemaFactory.createForClass(WaTemplate);
