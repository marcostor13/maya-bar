import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const HANDOFF_CHANNELS = ['whatsapp', 'email', 'sms'] as const;
export type HandoffChannel = (typeof HANDOFF_CHANNELS)[number];

/** Destinatario del aviso de derivación. */
export interface HandoffTarget {
  channel: HandoffChannel;
  /** Teléfono E.164 sin '+' (WhatsApp, SMS) o dirección de correo. */
  to: string;
  accountId?: string;
}

@Schema({ timestamps: true })
export class AiAgent extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ required: true })
  systemPrompt: string;

  @Prop({
    enum: ['auto', 'openai', 'claude', 'deepseek', 'gemini'],
    default: 'auto',
  })
  provider: string;

  @Prop()
  aiModel?: string;

  @Prop({ default: 0.4 })
  temperature: number;

  @Prop({ default: 800 })
  maxTokens: number;

  @Prop()
  greeting?: string; // saludo inicial opcional

  @Prop({ default: 'Lo siento, no tengo esa información en este momento.' })
  fallbackMessage: string;

  @Prop({ default: true })
  ragEnabled: boolean;

  @Prop({ default: 5 })
  topK: number;

  // Cuentas de WhatsApp por las que responde
  @Prop({
    type: [{ type: Types.ObjectId, ref: 'WhatsAppAccount' }],
    default: [],
  })
  accountIds: Types.ObjectId[];

  // Cuentas de Instagram (DM) por las que responde
  @Prop({
    type: [{ type: Types.ObjectId, ref: 'InstagramAccount' }],
    default: [],
  })
  instagramAccountIds: Types.ObjectId[];

  // Páginas de Facebook (Messenger) por las que responde
  @Prop({
    type: [{ type: Types.ObjectId, ref: 'MessengerAccount' }],
    default: [],
  })
  messengerAccountIds: Types.ObjectId[];

  // Buzones de correo que escucha y desde los que responde
  @Prop({
    type: [{ type: Types.ObjectId, ref: 'EmailAccount' }],
    default: [],
  })
  emailAccountIds: Types.ObjectId[];

  // ------------------------------------------------------------------
  // Escalamiento a un agente humano
  // ------------------------------------------------------------------

  /** Habilita el token {{HANDOFF}}: el agente puede derivar el chat a una persona. */
  @Prop({ default: false })
  handoffEnabled: boolean;

  /**
   * Quién recibe el aviso y por dónde: cada destinatario con su canal y, si se
   * quiere, la cuenta desde la que sale (WhatsApp o buzón de correo).
   */
  @Prop({
    type: [
      {
        _id: false,
        channel: { type: String, enum: HANDOFF_CHANNELS, required: true },
        to: { type: String, required: true },
        // Texto y no ObjectId: apunta a una cuenta de WhatsApp o a un buzón.
        accountId: { type: String },
      },
    ],
    default: [],
  })
  handoffTargets: HandoffTarget[];

  /**
   * Números que reciben el aviso por WhatsApp (E.164, sin +). Anterior a
   * `handoffTargets`: se siguen avisando, como destinatarios de WhatsApp.
   */
  @Prop({ type: [String], default: [] })
  handoffNumbers: string[];

  /**
   * Cuenta de WhatsApp para los avisos que no fijan la suya. Si no se indica se
   * usa la de la conversación (si es WhatsApp) o la predeterminada del tenant.
   */
  @Prop({ type: Types.ObjectId, ref: 'WhatsAppAccount' })
  handoffAccountId?: Types.ObjectId;

  /** Criterios de escalamiento que se inyectan en el prompt del sistema. */
  @Prop()
  handoffInstructions?: string;

  /** Lo que se le responde al cliente al derivar, si el agente no escribió nada. */
  @Prop({
    default:
      'Te comunico con una persona del equipo, en un momento te escriben por acá.',
  })
  handoffMessage: string;

  /**
   * Plantilla de Cloud API para el aviso. Hace falta cuando el agente humano no
   * escribió al número en las últimas 24 h (Meta bloquea el texto libre).
   * Debe tener 3 variables en el cuerpo: cliente, motivo y enlace.
   */
  @Prop()
  handoffTemplateName?: string;

  @Prop({ default: 'es' })
  handoffTemplateLang: string;

  @Prop({ default: false })
  published: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;
}

export const AiAgentSchema = SchemaFactory.createForClass(AiAgent);
