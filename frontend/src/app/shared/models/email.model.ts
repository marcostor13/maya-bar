export type EmailProvider = 'gmail' | 'outlook' | 'custom';
export type IncomingProtocol = 'imap' | 'pop3';
export type EmailStatus = 'connecting' | 'connected' | 'error' | 'disconnected';

export interface EmailAccount {
  _id: string;
  label: string;
  email: string;
  fromName?: string;
  signature: string;
  provider: EmailProvider;
  incomingProtocol: IncomingProtocol;
  incomingHost?: string;
  incomingPort?: number;
  incomingSecure: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure: boolean;
  username?: string;
  active: boolean;
  isDefault: boolean;
  skipBulk: boolean;
  status: EmailStatus;
  lastError?: string;
  lastSyncAt?: string;
}

export interface EmailAccountForm {
  label: string;
  email: string;
  fromName: string;
  signature: string;
  incomingProtocol: IncomingProtocol;
  incomingHost: string;
  incomingPort: number;
  incomingSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  password: string;
  skipBulk: boolean;
}

/** Servidores de los proveedores más comunes, para no tener que buscarlos. */
export interface EmailPreset {
  key: string;
  label: string;
  imap: [string, number];
  pop3: [string, number];
  smtp: [string, number, boolean];
  hint?: string;
}

export const EMAIL_PRESETS: EmailPreset[] = [
  { key: 'gmail', label: 'Gmail', imap: ['imap.gmail.com', 993], pop3: ['pop.gmail.com', 995], smtp: ['smtp.gmail.com', 465, true],
    hint: 'Con contraseña de aplicación (Cuenta de Google → Seguridad → Contraseñas de aplicaciones). Si puedes, usa mejor "Conectar Gmail".' },
  { key: 'outlook', label: 'Outlook / 365', imap: ['outlook.office365.com', 993], pop3: ['outlook.office365.com', 995], smtp: ['smtp.office365.com', 587, false],
    hint: 'Microsoft desactivó la contraseña básica en la mayoría de cuentas: usa "Conectar Outlook".' },
  { key: 'yahoo', label: 'Yahoo', imap: ['imap.mail.yahoo.com', 993], pop3: ['pop.mail.yahoo.com', 995], smtp: ['smtp.mail.yahoo.com', 465, true],
    hint: 'Requiere una contraseña de aplicación generada en Yahoo.' },
  { key: 'icloud', label: 'iCloud', imap: ['imap.mail.me.com', 993], pop3: ['imap.mail.me.com', 993], smtp: ['smtp.mail.me.com', 587, false],
    hint: 'iCloud no ofrece POP3. Usa una contraseña específica de app.' },
  { key: 'zoho', label: 'Zoho', imap: ['imap.zoho.com', 993], pop3: ['pop.zoho.com', 995], smtp: ['smtp.zoho.com', 465, true] },
  { key: 'hostinger', label: 'Hostinger', imap: ['imap.hostinger.com', 993], pop3: ['pop.hostinger.com', 995], smtp: ['smtp.hostinger.com', 465, true] },
  { key: 'godaddy', label: 'GoDaddy', imap: ['imap.secureserver.net', 993], pop3: ['pop.secureserver.net', 995], smtp: ['smtpout.secureserver.net', 465, true] },
];

export function blankEmailForm(): EmailAccountForm {
  return {
    label: '', email: '', fromName: '', signature: '',
    incomingProtocol: 'imap', incomingHost: '', incomingPort: 993, incomingSecure: true,
    smtpHost: '', smtpPort: 465, smtpSecure: true,
    username: '', password: '', skipBulk: true,
  };
}
