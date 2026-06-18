import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class WhatsAppAccount extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true })
  label: string; // nombre legible de la cuenta

  @Prop({ required: true, enum: ['waha', 'cloudapi'] })
  provider: string;

  @Prop()
  phoneNumber?: string; // número visible (informativo)

  // WAHA
  @Prop() wahaApiUrl?: string;
  @Prop() wahaApiKey?: string;
  @Prop({ default: 'default' }) wahaSession?: string;

  // WhatsApp Cloud API
  @Prop() waPhoneNumberId?: string;
  @Prop() waAccessToken?: string;
  @Prop() waBusinessAccountId?: string;
  @Prop() waVerifyToken?: string; // token de verificación del webhook (Meta)

  @Prop({ default: true })
  active: boolean;
}

export const WhatsAppAccountSchema = SchemaFactory.createForClass(WhatsAppAccount);
