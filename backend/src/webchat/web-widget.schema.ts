import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Chat web de la empresa (HU69). Su `_id` hace de `accountId` de las
 * conversaciones del canal `web`; `key` es pública y va en el código a pegar.
 */
@Schema({ timestamps: true, collection: 'web_widgets' })
export class WebWidget extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, unique: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, unique: true })
  key: string;

  @Prop({ default: false })
  active: boolean;

  @Prop({ default: 'Chatea con nosotros', trim: true })
  title: string;

  @Prop({ default: '¡Hola! ¿En qué te podemos ayudar?', trim: true })
  greeting: string;

  @Prop({ default: '#4F46E5' })
  color: string;

  /** Pide nombre y teléfono o email antes del primer mensaje. */
  @Prop({ default: false })
  askContact: boolean;

  /** Número para el botón "Seguir por WhatsApp" (solo dígitos). */
  @Prop()
  whatsappNumber?: string;

  @Prop({ type: [String], default: [] })
  allowedDomains: string[];

  /** Agente de IA que atiende el chat; sin él, solo el equipo. */
  @Prop({ type: Types.ObjectId, ref: 'AiAgent' })
  agentId?: Types.ObjectId;
}

export const WebWidgetSchema = SchemaFactory.createForClass(WebWidget);
