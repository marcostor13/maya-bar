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

/** URL pública del webhook + verify token, resueltos por el backend (PUBLIC_API_URL). */
export interface WebhookConfig {
  url?: string;
  verifyToken?: string;
}

export interface TokenRefreshResult {
  success: boolean;
  tokenExpiresAt: string;
}

// ── Plantillas WhatsApp (Cloud API) ───────────────────────────────────────

export type WaTemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

export type WaTemplateStatus =
  | 'APPROVED' | 'PENDING' | 'IN_APPEAL' | 'REJECTED' | 'PAUSED' | 'DISABLED';

export type WaHeaderFormat = 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'LOCATION';

export type WaButtonType = 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE';

/** Cabecera de la plantilla tal como la edita el formulario. */
export interface WaTemplateHeader {
  format: WaHeaderFormat;
  text?: string;
  /** Handle devuelto por Meta; se resuelve solo si se manda mediaUrl. */
  handle?: string;
  mediaUrl?: string;
  example?: string;
}

export interface WaTemplateButton {
  type: WaButtonType;
  text?: string;
  url?: string;
  urlExample?: string;
  phoneNumber?: string;
  example?: string;
}

/** Componente crudo de Meta (lo que devuelve el sync). */
export interface WaTemplateComponent {
  type: string;
  format?: string;
  text?: string;
  example?: Record<string, unknown>;
  buttons?: Record<string, unknown>[];
}

export interface WaTemplate {
  _id: string;
  accountId: string;
  metaId: string;
  name: string;
  category: WaTemplateCategory;
  language: string;
  status: WaTemplateStatus;
  rejectedReason?: string;
  qualityScore?: string;
  body: string;
  headerType?: string;
  headerText?: string;
  footer?: string;
  components?: WaTemplateComponent[];
}

export interface WaTemplatePayload {
  accountId: string;
  name: string;
  category: WaTemplateCategory;
  language: string;
  body: string;
  bodyExamples?: string[];
  header?: WaTemplateHeader;
  footer?: string;
  buttons?: WaTemplateButton[];
  allowCategoryChange?: boolean;
}

/** Meta no deja cambiar nombre ni idioma: la edición solo toca componentes. */
export interface WaTemplateUpdatePayload {
  category?: WaTemplateCategory;
  body: string;
  bodyExamples?: string[];
  header?: WaTemplateHeader;
  footer?: string;
  buttons?: WaTemplateButton[];
}

/** Cuenta Cloud API que puede tener plantillas. */
export interface WaTemplateAccount {
  _id: string;
  label: string;
  phoneNumber?: string;
  wabaId?: string;
  active: boolean;
  isDefault: boolean;
  /** false si falta Access Token o WABA ID. */
  ready: boolean;
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
