/** Modelos de la feature de campañas (email / WhatsApp). */

export type CampaignChannel = 'email' | 'waha' | 'cloudapi' | 'sms';
export type CampaignTargeting = 'all' | 'tags' | 'lists' | 'contacts';
export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
export type CampaignType = 'email' | 'whatsapp' | 'sms';

/** Recuento por estado de los destinatarios (email y SMS). */
export interface CampaignStats {
  total: number;
  pending: number;
  sent: number;
  failed: number;
  skipped: number;
}

export type RecipientStatus = 'pending' | 'sent' | 'failed' | 'skipped';

export interface CampaignRecipient {
  _id: string;
  customerId: string;
  name: string;
  to: string;
  status: RecipientStatus;
  error?: string;
  sentAt?: string;
  shortUrl?: string;
}

export interface CampaignRecipientsPage {
  items: CampaignRecipient[];
  total: number;
  page: number;
  pageSize: number;
  stats: CampaignStats;
}

/** A cuántos llegaría una audiencia, antes de guardar la campaña. */
export interface AudiencePreview {
  total: number;
  reachable: number;
  blocked: number;
  missing: number;
}
export type CampaignMediaType = 'image' | 'video' | 'audio' | 'document';

export interface ContactList {
  _id: string;
  name: string;
  type: 'static' | 'dynamic';
  memberCount: number;
  color: string;
}

export interface CampaignEstimate {
  recipientCount: number;
  estimatedMinutes: number;
  dailyLimit: number;
  sentToday: number;
  remaining: number;
  cloudApiPricePerMsg?: number;
  /** Solo SMS: partes en que se divide el mensaje. */
  smsSegments?: number;
}

export interface Campaign {
  _id: string;
  name: string;
  type: CampaignType;
  waProvider?: 'waha' | 'cloudapi';
  subject?: string;
  body: string;
  targeting: CampaignTargeting;
  recipientTags: string[];
  listIds: string[];
  customerIds?: string[];
  emailTemplateId?: string;
  senderAccountId?: string;
  linkUrl?: string;
  linkDomain?: string;
  scheduledAt?: string;
  stats?: CampaignStats;
  recipientCount: number;
  status: CampaignStatus;
  sentAt?: string;
  errorMessage?: string;
  createdAt: string;
  mediaUrl?: string;
  mediaType?: CampaignMediaType;
  templateName?: string;
  templateLanguage?: string;
  templateVars?: string[];
}

export interface WaTemplate {
  _id: string;
  name: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED';
  body: string;
  /** TEXT | IMAGE | VIDEO | DOCUMENT. Las multimedia exigen adjunto en cada envío. */
  headerType?: string;
  headerText?: string;
  /** Archivo de ejemplo guardado al sincronizar; sirve de cabecera por defecto. */
  headerMediaUrl?: string;
  footer?: string;
}

/** Body de creación/edición de campaña. */
export interface CampaignPayload {
  name: string;
  type: CampaignType;
  waProvider?: 'waha' | 'cloudapi';
  subject?: string;
  body: string;
  targeting: CampaignTargeting;
  recipientTags: string[];
  listIds: string[];
  customerIds?: string[];
  // Cadena vacía = quitar el valor guardado.
  emailTemplateId?: string;
  senderAccountId?: string;
  linkUrl?: string;
  linkDomain?: string;
  scheduledAt?: string;
  mediaUrl?: string;
  mediaType?: CampaignMediaType;
  templateName?: string;
  templateLanguage?: string;
  templateVars?: string[];
}

export interface GeneratedEmail {
  subject: string;
  body: string;
}

export const PRESET_TAGS = ['VIP', 'Vegetariano', 'Cumpleañero', 'Corporativo', 'Delivery', 'Fiel', 'Nuevo', 'Alérgico'];
