import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'voice'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contact'
  | 'unsupported';

export type MessageStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed';

/** Quién originó el mensaje: el cliente, el agente IA, un operador humano o el sistema. */
export type MessageAuthor = 'customer' | 'agent' | 'human' | 'system';

@Schema({ timestamps: true })
export class Message extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true,
  })
  conversationId: Types.ObjectId;

  @Prop({ required: true, enum: ['in', 'out'] })
  direction: string;

  @Prop({ required: true, enum: ['customer', 'agent', 'human', 'system'] })
  author: MessageAuthor;

  @Prop({
    required: true,
    enum: [
      'text',
      'image',
      'video',
      'audio',
      'voice',
      'document',
      'sticker',
      'location',
      'contact',
      'unsupported',
    ],
    default: 'text',
  })
  type: MessageType;

  /** Texto del mensaje o caption del adjunto. */
  @Prop({ default: '' })
  text: string;

  // --- Adjunto (ya re-hospedado en S3) ---
  @Prop() mediaUrl?: string;
  @Prop() mediaKey?: string;
  @Prop() mimeType?: string;
  @Prop() filename?: string;
  @Prop() size?: number;
  @Prop() durationSeconds?: number;

  /** El cliente mandó un adjunto, pero el canal no lo entregó o no se pudo bajar. */
  @Prop() mediaUnavailable?: boolean;

  /**
   * Tipo tal como lo nombró el proveedor ("poll_creation", "ciphertext",
   * "unsupported"...), para saber qué llegó cuando no se pudo interpretar.
   */
  @Prop() rawType?: string;

  /**
   * Lo que dice el adjunto en texto: transcripción de la nota de voz o del
   * audio, descripción de la imagen o del video, contenido del documento. Se
   * calcula una sola vez al recibirlo y es lo que lee el agente IA en cada
   * turno (y el operador en la bandeja, sin abrir el archivo).
   */
  @Prop() transcript?: string;

  // --- Ubicación ---
  @Prop() latitude?: number;
  @Prop() longitude?: number;
  @Prop() locationName?: string;

  // --- Correo ---
  /** Asunto del correo (solo canal email). */
  @Prop() subject?: string;

  /** Cadena de Message-ID previos (References), para mantener el hilo al responder. */
  @Prop({ type: [String], default: undefined })
  emailReferences?: string[];

  /** id del mensaje en el proveedor (wamid de WhatsApp, mid de Meta) — usado para los acks. */
  @Prop({ index: true })
  externalId?: string;

  /**
   * Mensaje al que este responde, como en WhatsApp. Se guarda la referencia
   * interna para poder pintar la cita aunque el proveedor no la devuelva, y el
   * `externalId` del citado es lo que se manda al canal para que el cliente
   * vea la respuesta enlazada en su propia aplicación.
   */
  @Prop({ type: Types.ObjectId, ref: 'Message' })
  replyToId?: Types.ObjectId;

  @Prop({
    enum: ['pending', 'sent', 'delivered', 'read', 'failed'],
    default: 'sent',
  })
  status: MessageStatus;

  @Prop()
  error?: string;

  // --- Reintento automático de envíos fallidos (HU7, MessageRetryService) ---
  /** Reintentos ya hechos. */
  @Prop() retryCount?: number;
  /** Próximo intento; mientras se envía, también hace de candado. */
  @Prop() retryAt?: Date;
  /** No se reintenta más (error no temporal, superado o fuera de ventana). */
  @Prop() retryStopped?: boolean;

  /** Entrante que el agente IA todavía no ha respondido (HU11, se agrupan). */
  @Prop() agentPending?: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  sentBy?: Types.ObjectId;

  // --- Enviado por la API de integraciones (HU13) ---
  /** Acceso de API que lo envió. */
  @Prop({ type: Types.ObjectId, ref: 'ApiAccess' })
  apiAccessId?: Types.ObjectId;
  /** Nombre del acceso al enviarlo, para pintarlo en la bandeja. */
  @Prop() apiAccessName?: string;
  /** `Idempotency-Key` del envío: un reintento no lo duplica. */
  @Prop() apiIdempotencyKey?: string;

  /** Id del dispositivo que lo escribió: reenviarlo sin red no lo duplica (HU24). */
  @Prop() clientId?: string;

  /**
   * Plantilla de WhatsApp con la que salió (HU27). `text` guarda el cuerpo ya
   * rellenado para pintarlo; con esto un reintento sale otra vez como
   * plantilla, que es lo único que Meta acepta fuera de la ventana de 24 h.
   */
  @Prop({ type: Object })
  template?: {
    name: string;
    language: string;
    variables: string[];
    header?: { format: string; text?: string; mediaUrl?: string };
  };

  /** Su chat está en la papelera: no cuenta en los paneles. */
  @Prop()
  inTrash?: boolean;

  /**
   * Cobro que informa Meta en el estado (`statuses[].pricing`) y su costo de
   * lista en USD según el mercado del destinatario (HU18).
   */
  @Prop({ type: Object })
  pricing?: { category?: string; type?: string; market?: string; usd?: number };

  @Prop({ type: Date, default: Date.now, index: true })
  at: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index({ conversationId: 1, at: -1 });
// Rendimiento por usuario en el dashboard (HU20): solo los enviados a mano.
MessageSchema.index(
  { tenantId: 1, sentBy: 1, at: 1 },
  { partialFilterExpression: { sentBy: { $exists: true } } },
);
// Idempotencia de la API (HU13): una clave por acceso, solo en los que la traen.
MessageSchema.index(
  { apiAccessId: 1, apiIdempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { apiIdempotencyKey: { $type: 'string' } },
  },
);
// Idempotencia de la bandeja (HU24): un id de dispositivo por empresa.
MessageSchema.index(
  { tenantId: 1, clientId: 1 },
  {
    unique: true,
    partialFilterExpression: { clientId: { $type: 'string' } },
  },
);
// Candidatos del reintento automático: solo indexa los fallidos, que son pocos.
MessageSchema.index(
  { status: 1, at: -1 },
  { partialFilterExpression: { status: 'failed' } },
);
// Entrantes pendientes de respuesta del agente: pocos y de vida corta.
MessageSchema.index(
  { conversationId: 1, at: 1 },
  { partialFilterExpression: { agentPending: true } },
);
