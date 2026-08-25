/** Modelos de la feature de campañas (email / WhatsApp). */

export type CampaignChannel = 'email' | 'waha' | 'cloudapi';
export type CampaignTargeting = 'all' | 'tags' | 'lists';
export type CampaignStatus = 'draft' | 'sending' | 'sent' | 'failed';
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
}

export interface Campaign {
  _id: string;
  name: string;
  type: 'email' | 'whatsapp';
  waProvider?: 'waha' | 'cloudapi';
  subject?: string;
  body: string;
  targeting: CampaignTargeting;
  recipientTags: string[];
  listIds: string[];
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
  headerText?: string;
  footer?: string;
}

/** Body de creación/edición de campaña. */
export interface CampaignPayload {
  name: string;
  type: 'email' | 'whatsapp';
  waProvider?: 'waha' | 'cloudapi';
  subject?: string;
  body: string;
  targeting: CampaignTargeting;
  recipientTags: string[];
  listIds: string[];
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
