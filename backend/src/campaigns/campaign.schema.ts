import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CampaignType = 'email' | 'whatsapp';
export type CampaignStatus = 'draft' | 'sending' | 'sent' | 'failed';
export type WaProvider = 'waha' | 'cloudapi';
export type MediaType = 'image' | 'video' | 'audio' | 'document';

@Schema({ timestamps: true })
export class Campaign extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ enum: ['email', 'whatsapp'], required: true })
  type: CampaignType;

  @Prop({ enum: ['waha', 'cloudapi'], default: 'waha' })
  waProvider?: WaProvider;

  @Prop()
  subject?: string;

  @Prop({ required: true })
  body: string;

  @Prop({ enum: ['all', 'tags', 'lists'], default: 'tags' })
  targeting: 'all' | 'tags' | 'lists';

  @Prop({ type: [String], default: [] })
  recipientTags: string[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'ContactList' }], default: [] })
  listIds: Types.ObjectId[];

  @Prop({ default: 0 })
  recipientCount: number;

  @Prop({ enum: ['draft', 'sending', 'sent', 'failed'], default: 'draft' })
  status: CampaignStatus;

  @Prop()
  sentAt?: Date;

  @Prop()
  errorMessage?: string;

  @Prop()
  mediaUrl?: string;

  @Prop({ enum: ['image', 'video', 'audio', 'document'] })
  mediaType?: MediaType;

  // Cloud API template fields
  @Prop()
  templateName?: string;

  @Prop()
  templateLanguage?: string;

  @Prop({ type: [String], default: [] })
  templateVars?: string[];
}

export const CampaignSchema = SchemaFactory.createForClass(Campaign);
