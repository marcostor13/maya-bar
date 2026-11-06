import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class TenantConfig extends Document {
  @Prop({ type: Types.ObjectId, required: true, unique: true })
  tenantId: Types.ObjectId;

  @Prop({ default: 'none' })
  whatsappProvider: string; // 'none' | 'cloudapi'

  // WhatsApp Cloud API
  @Prop() waPhoneNumberId?: string;
  @Prop() waAccessToken?: string;
  @Prop() waBusinessAccountId?: string;

  // API keys de IA (por tenant, usadas por el agente)
  @Prop() openaiApiKey?: string;
  @Prop() deepseekApiKey?: string;
  @Prop() geminiApiKey?: string;
  @Prop() claudeApiKey?: string;

  // Prospección: fuentes de datos para investigar empresas.
  @Prop() googlePlacesApiKey?: string;
  @Prop() pageSpeedApiKey?: string;
  @Prop() serperApiKey?: string;
  @Prop() hunterApiKey?: string;
}

export const TenantConfigSchema = SchemaFactory.createForClass(TenantConfig);
