/** Modelos de la feature de configuración: cuentas WhatsApp / Instagram, plantillas y keys de IA. */

/** Configuración del tenant (GET/PUT /settings): límite diario de WhatsApp y API keys de IA. */
export interface TenantSettings {
  waDailyLimit?: number;
  openaiApiKey?: string;
  deepseekApiKey?: string;
  geminiApiKey?: string;
  claudeApiKey?: string;
}

// ── WhatsApp ──────────────────────────────────────────────────────────────

export interface WaAccount {
  _id: string;
  label: string;
  provider: 'waha' | 'cloudapi';
  phoneNumber?: string;
  wahaApiUrl?: string;
  wahaApiKey?: string;
  wahaSession?: string;
  waPhoneNumberId?: string;
  waAccessToken?: string;
  waBusinessAccountId?: string;
  waVerifyToken?: string;
  tokenExpiresAt?: string;
  active: boolean;
  isDefault?: boolean;
}

export type WaAccountPayload = Omit<WaAccount, '_id'>;

export interface WaStatus {
  connected: boolean;
  state?: string;
  phoneNumber?: string;
  error?: string;
}

export interface WaQr {
  qrcode?: string;
  error?: string;
}

export interface WaTestResult {
  success: boolean;
  formattedPhone?: string;
  error?: string;
}

export interface WaOauthConfig {
  appId?: string;
  configId?: string;
}

export interface WaOauthConnectPayload {
  code: string;
  wabaId: string;
  phoneNumberId: string;
}

// ── Instagram ─────────────────────────────────────────────────────────────

export interface IgAccount {
  _id: string;
  label: string;
  username?: string;
  igBusinessAccountId?: string;
  pageId?: string;
  pageAccessToken?: string;
  tokenExpiresAt?: string;
  active: boolean;
}

export type IgAccountPayload = Omit<IgAccount, '_id'>;

export interface IgStatus {
  connected: boolean;
  username?: string;
  error?: string;
}

// ── Comunes ───────────────────────────────────────────────────────────────

export interface WebhookResult {
  success: boolean;
  message: string;
}

export interface TokenRefreshResult {
  success: boolean;
  tokenExpiresAt: string;
}

// ── Plantillas WhatsApp (Cloud API) ───────────────────────────────────────

export type WaTemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

export interface WaTemplate {
  _id: string;
  name: string;
  category: WaTemplateCategory;
  language: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED';
  body: string;
  headerText?: string;
  footer?: string;
}

export interface WaTemplatePayload {
  name: string;
  category: WaTemplateCategory;
  language: string;
  body: string;
  headerText?: string;
  footer?: string;
}

// ── Factories de formularios ──────────────────────────────────────────────

export function blankWaAccount(): WaAccount {
  return {
    _id: '', label: '', provider: 'waha', phoneNumber: '', wahaApiUrl: '', wahaApiKey: '',
    wahaSession: 'default', waPhoneNumberId: '', waAccessToken: '', waBusinessAccountId: '',
    waVerifyToken: '', active: true,
  };
}

export function blankIgAccount(): IgAccount {
  return {
    _id: '', label: '', username: '', igBusinessAccountId: '', pageId: '',
    pageAccessToken: '', active: true,
  };
}
