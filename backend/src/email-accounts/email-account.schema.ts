import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const EMAIL_PROVIDERS = ['gmail', 'outlook', 'custom'] as const;
export type EmailProvider = (typeof EMAIL_PROVIDERS)[number];

export const INCOMING_PROTOCOLS = ['imap', 'pop3'] as const;
export type IncomingProtocol = (typeof INCOMING_PROTOCOLS)[number];

export type EmailConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'error'
  | 'disconnected';

/**
 * Buzón conectado. Recibe por IMAP (en vivo, con IDLE) o POP3 (sondeo) y
 * envía por SMTP. Gmail y Outlook usan OAuth2 sobre esos mismos protocolos,
 * así que todo el correo pasa por un único camino.
 *
 * Las credenciales se guardan cifradas (`SecretBox`) y nunca salen en la API.
 */
@Schema({ timestamps: true })
export class EmailAccount extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  label: string;

  /** Dirección del buzón: remitente de lo que se envía. */
  @Prop({ required: true, trim: true, lowercase: true, index: true })
  email: string;

  /** Nombre que ve el cliente en "De:". */
  @Prop({ trim: true })
  fromName?: string;

  /** Firma que se añade a cada correo enviado. */
  @Prop({ default: '' })
  signature: string;

  @Prop({ type: String, enum: EMAIL_PROVIDERS, required: true })
  provider: EmailProvider;

  @Prop({ type: String, enum: INCOMING_PROTOCOLS, default: 'imap' })
  incomingProtocol: IncomingProtocol;

  @Prop() incomingHost?: string;
  @Prop() incomingPort?: number;
  @Prop({ default: true }) incomingSecure: boolean;

  @Prop() smtpHost?: string;
  @Prop() smtpPort?: number;
  /** true = TLS directo (465); false = STARTTLS (587). */
  @Prop({ default: true }) smtpSecure: boolean;

  /** Usuario de IMAP/POP3/SMTP; casi siempre la propia dirección. */
  @Prop({ trim: true })
  username?: string;

  @Prop({ select: false }) passwordEnc?: string;
  @Prop({ select: false }) refreshTokenEnc?: string;
  @Prop({ select: false }) accessTokenEnc?: string;
  @Prop({ type: Date }) accessTokenExpiresAt?: Date;

  @Prop({ default: true })
  active: boolean;

  @Prop({ default: false })
  isDefault: boolean;

  /** No ingresar boletines ni listas de correo (List-Id, Precedence: bulk). */
  @Prop({ default: true })
  skipBulk: boolean;

  @Prop({
    type: String,
    enum: ['connecting', 'connected', 'error', 'disconnected'],
    default: 'connecting',
  })
  status: EmailConnectionStatus;

  @Prop() lastError?: string;
  @Prop({ type: Date }) lastSyncAt?: Date;

  /** Punto de sincronización IMAP: se reinicia si cambia UIDVALIDITY. */
  @Prop() uidValidity?: string;
  @Prop() lastUid?: number;

  /** POP3 no tiene UIDs crecientes: se recuerdan los UIDL ya vistos. */
  @Prop({ type: [String], default: [], select: false })
  seenUidls: string[];

  /** Qué instancia del backend escucha este buzón y hasta cuándo. */
  @Prop() listenerId?: string;
  @Prop({ type: Date }) leaseUntil?: Date;
}

export const EmailAccountSchema = SchemaFactory.createForClass(EmailAccount);
EmailAccountSchema.index({ tenantId: 1, email: 1 }, { unique: true });
