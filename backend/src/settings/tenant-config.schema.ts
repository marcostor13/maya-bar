import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class TenantConfig extends Document {
  @Prop({ type: Types.ObjectId, required: true, unique: true })
  tenantId: Types.ObjectId;

  @Prop({ default: 'none' })
  whatsappProvider: string; // 'none' | 'waha' | 'cloudapi'

  // WAHA
  @Prop() wahaApiUrl?: string;
  @Prop() wahaApiKey?: string;
  @Prop({ default: 'default' }) wahaSession?: string;
  @Prop({ default: 50 }) waDailyLimit?: number;

  // WhatsApp Cloud API
  @Prop() waPhoneNumberId?: string;
  @Prop() waAccessToken?: string;
  @Prop() waBusinessAccountId?: string;
}

export const TenantConfigSchema = SchemaFactory.createForClass(TenantConfig);
