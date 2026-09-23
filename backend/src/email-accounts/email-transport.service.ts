import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImapFlow } from 'imapflow';
import { createTransport } from 'nodemailer';
import { assertPublicHost } from '../shared/network';
import { Pop3Client } from './pop3-client';
import type { IncomingProtocol } from './email-account.schema';

/** Credencial ya resuelta: contraseña o access token de OAuth (XOAUTH2). */
export type MailAuth =
  | { user: string; pass: string }
  | { user: string; accessToken: string };

export interface IncomingConfig {
  protocol: IncomingProtocol;
  host: string;
  port: number;
  secure: boolean;
  auth: MailAuth;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: MailAuth;
}

export interface OutgoingEmail {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  inReplyTo?: string;
  references?: string[];
  attachments?: { filename?: string; href: string; contentType?: string }[];
  /** Cabeceras extra (p. ej. Auto-Submitted en las respuestas del agente). */
  headers?: Record<string, string>;
}

/** Correo crudo descargado del buzón con su marca de sincronización. */
export interface FetchedRaw {
  /** UID (IMAP) o UIDL (POP3). */
  id: string;
  raw: Buffer;
}

const TIMEOUT_MS = 30_000;
const MAX_OUTGOING_ATTACHMENT = 20 * 1024 * 1024;

/**
 * Habla los protocolos de correo. No sabe de tenants ni de conversaciones:
 * recibe la configuración ya resuelta (con la credencial descifrada) y
 * devuelve correos crudos o el Message-ID de lo enviado.
 */
@Injectable()
export class EmailTransportService {
  constructor(private config: ConfigService) {}

  /**
   * Los hosts los escribe el usuario: sin esta comprobación el servidor se
   * podría usar para abrir conexiones hacia la red interna.
   */
  async assertHost(host: string): Promise<void> {
    if (this.config.get<string>('EMAIL_ALLOW_PRIVATE_HOSTS') === 'true') return;
    await assertPublicHost(host);
  }

  /**
   * Certificados autofirmados (servidores propios o hosting compartido): solo
   * se aceptan si el servidor lo habilita con EMAIL_TLS_REJECT_UNAUTHORIZED=false.
   */
  private get rejectUnauthorized(): boolean {
    return this.config.get<string>('EMAIL_TLS_REJECT_UNAUTHORIZED') !== 'false';
  }

  createImap(cfg: IncomingConfig): ImapFlow {
    return new ImapFlow({
      tls: { rejectUnauthorized: this.rejectUnauthorized },
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.auth,
      logger: false,
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
      socketTimeout: 10 * 60_000,
      // IDLE se renueva antes de que los servidores lo corten (~29 min).
      maxIdleTime: 5 * 60_000,
    });
  }

  /** Comprueba que se puede leer y enviar con esta configuración. */
  async test(incoming: IncomingConfig, smtp: SmtpConfig): Promise<void> {
    await this.assertHost(incoming.host);
    await this.assertHost(smtp.host);
    if (incoming.protocol === 'imap') {
      const client = this.createImap(incoming);
      try {
        await client.connect();
        await client.mailboxOpen('INBOX', { readOnly: true });
      } catch (err) {
        throw new Error(`Entrada (IMAP): ${describe(err)}`);
      } finally {
        await client.logout().catch(() => undefined);
      }
    } else {
      const pop = await this.openPop3(incoming).catch((err: unknown) => {
        throw new Error(`Entrada (POP3): ${describe(err)}`);
      });
      await pop.quit();
    }
    const transport = this.smtpTransport(smtp);
    try {
      await transport.verify();
    } catch (err) {
      throw new Error(`Salida (SMTP): ${describe(err)}`);
    } finally {
      transport.close();
    }
  }

  async send(smtp: SmtpConfig, mail: OutgoingEmail): Promise<string> {
    await this.assertHost(smtp.host);
    const transport = this.smtpTransport(smtp);
    try {
      const info = await transport.sendMail({
        from: mail.from,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        inReplyTo: mail.inReplyTo,
        references: mail.references?.length ? mail.references : undefined,
        headers: mail.headers,
        attachments: await Promise.all(
          (mail.attachments ?? []).map(async (a) => ({
            filename: a.filename,
            contentType: a.contentType,
            content: await this.downloadAttachment(a.href),
          })),
        ),
      });
      return info.messageId;
    } finally {
      transport.close();
    }
  }

  /**
   * Descarga el adjunto aquí, con límite de tamaño y sin seguir redirecciones:
   * la URL viene del cliente y nodemailer la pediría desde el servidor sin
   * ningún filtro.
   */
  private async downloadAttachment(href: string): Promise<Buffer> {
    const url = new URL(href);
    if (url.protocol !== 'https:' && url.protocol !== 'http:')
      throw new Error('Adjunto con una URL no válida');
    await this.assertHost(url.hostname);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        redirect: 'error',
        signal: controller.signal,
      });
      if (!res.ok)
        throw new Error(`No se pudo descargar el adjunto (${res.status})`);
      const size = Number(res.headers.get('content-length') ?? 0);
      if (size > MAX_OUTGOING_ATTACHMENT)
        throw new Error('El adjunto supera 20 MB');
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_OUTGOING_ATTACHMENT)
        throw new Error('El adjunto supera 20 MB');
      return buf;
    } finally {
      clearTimeout(timer);
    }
  }

  private smtpTransport(smtp: SmtpConfig) {
    const auth =
      'accessToken' in smtp.auth
        ? {
            type: 'OAuth2' as const,
            user: smtp.auth.user,
            accessToken: smtp.auth.accessToken,
          }
        : { user: smtp.auth.user, pass: smtp.auth.pass };
    return createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      // En 587 se exige STARTTLS: nunca se manda la contraseña en claro.
      requireTLS: !smtp.secure,
      tls: { rejectUnauthorized: this.rejectUnauthorized },
      auth,
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
      socketTimeout: 60_000,
    });
  }

  // ── IMAP ────────────────────────────────────────────────────────────────

  /**
   * Correos del INBOX posteriores a `lastUid`. Si el buzón cambió de
   * UIDVALIDITY (lo recrearon) o es la primera vez, no se importa el
   * histórico: se marca el punto actual y se empieza desde ahí.
   */
  async fetchImapSince(
    client: ImapFlow,
    state: { uidValidity?: string; lastUid?: number },
  ): Promise<{ uidValidity: string; lastUid: number; messages: FetchedRaw[] }> {
    const box = await client.mailboxOpen('INBOX');
    const uidValidity = String(box.uidValidity);
    const current = Math.max(0, (box.uidNext ?? 1) - 1);
    if (state.uidValidity !== uidValidity || state.lastUid === undefined)
      return { uidValidity, lastUid: current, messages: [] };

    const from = state.lastUid + 1;
    if (from > current)
      return { uidValidity, lastUid: state.lastUid, messages: [] };

    const messages: FetchedRaw[] = [];
    let lastUid = state.lastUid;
    for await (const msg of client.fetch(
      `${from}:*`,
      { uid: true, source: true },
      { uid: true },
    )) {
      // `N:*` devuelve el último mensaje aunque su UID sea menor que N.
      if (msg.uid <= state.lastUid || !msg.source) continue;
      messages.push({ id: String(msg.uid), raw: msg.source });
      lastUid = Math.max(lastUid, msg.uid);
    }
    return { uidValidity, lastUid, messages };
  }

  // ── POP3 ────────────────────────────────────────────────────────────────

  private async openPop3(cfg: IncomingConfig): Promise<Pop3Client> {
    await this.assertHost(cfg.host);
    if ('accessToken' in cfg.auth)
      throw new Error('POP3 solo admite usuario y contraseña');
    const pop = new Pop3Client({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      timeoutMs: TIMEOUT_MS,
      rejectUnauthorized: this.rejectUnauthorized,
    });
    await pop.connect();
    try {
      await pop.login(cfg.auth.user, cfg.auth.pass);
    } catch (err) {
      await pop.quit();
      throw err;
    }
    return pop;
  }

  /**
   * Correos POP3 cuyo UIDL no está en `seen`. La primera vez (`seen` vacío y
   * `firstSync`) solo se memorizan los existentes, sin importarlos.
   */
  async fetchPop3New(
    cfg: IncomingConfig,
    seen: string[],
    firstSync: boolean,
    limit = 50,
  ): Promise<{ uidls: string[]; messages: FetchedRaw[] }> {
    const pop = await this.openPop3(cfg);
    try {
      const all = await pop.uidl();
      const uidls = [...all.values()];
      if (firstSync) return { uidls, messages: [] };
      const known = new Set(seen);
      const messages: FetchedRaw[] = [];
      for (const [num, uid] of all) {
        if (known.has(uid)) continue;
        messages.push({ id: uid, raw: await pop.retr(num) });
        if (messages.length >= limit) break;
      }
      return { uidls, messages };
    } finally {
      await pop.quit();
    }
  }
}

export function describe(err: unknown): string {
  const e = err as {
    responseText?: string;
    response?: string;
    message?: string;
    code?: string;
  };
  const text = e?.responseText || e?.response || e?.message || String(err);
  if (/auth|login|credential|invalid|535|534/i.test(text))
    return `credenciales rechazadas (${text.slice(0, 160)})`;
  return text.slice(0, 200);
}
