import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import type { AiProviderId } from '../providers/ai-provider.interface';

export const PLATFORM_AI_PROVIDERS: AiProviderId[] = [
  'deepseek',
  'claude',
  'openai',
  'gemini',
];

/**
 * Cuenta de IA de la plataforma (HU85): la usan gratis las empresas sin API key
 * propia. Documento único (`key: 'default'`), editable solo por el superadmin.
 */
@Schema({ collection: 'platform_ai_settings', timestamps: true })
export class PlatformAiSettings extends Document {
  @Prop({ required: true, unique: true, default: 'default' })
  key: string;

  @Prop({ default: false })
  enabled: boolean;

  @Prop({ type: String, enum: PLATFORM_AI_PROVIDERS })
  provider?: AiProviderId;

  @Prop()
  aiModel?: string;

  /** API key cifrada con `SecretBox`; nunca sale del servidor. */
  @Prop()
  apiKeyEnc?: string;

  /** Últimos 4 caracteres, para reconocer la key en la pantalla. */
  @Prop()
  keyLast4?: string;

  @Prop()
  updatedBy?: string;

  updatedAt?: Date;
}

export const PlatformAiSettingsSchema =
  SchemaFactory.createForClass(PlatformAiSettings);
