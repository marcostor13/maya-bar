import { Injectable, Logger } from '@nestjs/common';
import { MetaGraphClient, MetaApiError } from '../shared/meta-graph.client';

export interface WaConfig {
  provider: string;
  waPhoneNumberId?: string;
  waAccessToken?: string;
  waBusinessAccountId?: string;
  webhookUrl?: string; // URL a la que Cloud API debe reenviar los mensajes entrantes
}

export interface WaStatus {
  provider: string;
  configured: boolean;
  connected: boolean;
  instance?: string;
  phoneNumber?: string;
  state?: string;
  error?: string;
}

export type WaMediaType = 'image' | 'video' | 'audio' | 'document';

/** Respuesta de /{phoneNumberId}/block_users de la Cloud API. */
interface CloudBlockResult {
  block_users?: {
    failed_users?: { errors?: { message?: string }[] }[];
  };
}

/** Respuesta de /{phoneNumberId}/messages de la Cloud API. */
interface CloudSendResult {
  messages?: { id?: string }[];
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(private readonly graph: MetaGraphClient) {}

  /**
   * Envía un mensaje y devuelve el wamid (para rastrear los acks), si lo hay.
   * @param replyTo wamid del mensaje citado: el cliente ve la respuesta enlazada.
   */
  async sendMessage(
    to: string,
    body: string,
    config: WaConfig,
    mediaUrl?: string,
    mediaType?: WaMediaType,
    replyTo?: string,
  ): Promise<string | undefined> {
    const phone = this.formatPhone(to);
    if (!phone) {
      this.logger.warn(`Skipping WA message — invalid phone: ${to}`);
      return undefined;
    }
    if (config.provider !== 'cloudapi') {
      this.logger.log(
        `[MOCK WA] To: ${phone} | ${mediaType ? `${mediaType}: ${mediaUrl}` : body.substring(0, 80)}`,
      );
      return undefined;
    }

    if (mediaUrl && mediaType) {
      if (mediaType === 'audio')
        return this.sendCloudApiAudio(phone, mediaUrl, config);
      if (mediaType === 'document')
        return this.sendCloudApiDocument(phone, body, mediaUrl, config);
      return this.sendCloudApiMedia(phone, body, mediaUrl, mediaType, config);
    }
    return this.sendCloudApi(phone, body, config, replyTo);
  }

  async sendCloudApiTemplate(
    to: string,
    templateName: string,
    language: string,
    vars: string[],
    config: WaConfig,
    header?: TemplateHeader,
  ): Promise<void> {
    const phone = this.formatPhone(to);
    if (!phone) {
      this.logger.warn(`Skipping template — invalid phone: ${to}`);
      return;
    }
    const components: object[] = [];

    /*
     * Meta exige que los componentes del envío calquen los de la plantilla
     * aprobada. Si la plantilla tiene cabecera con contenido variable (una
     * imagen, un vídeo, un documento o un texto con {{1}}) y el envío no manda
     * ese parámetro, responde 400 (#132012) "Parameter format does not match
     * format in the created template". Mandar solo el body no bastaba.
     */
    const headerParam = buildHeaderParameter(header);
    if (headerParam)
      components.push({ type: 'header', parameters: [headerParam] });

    if (vars.length > 0) {
      components.push({
        type: 'body',
        parameters: vars.map((v) => ({ type: 'text', text: v })),
      });
    }
    await this.postCloudApiMessage(config, 'CloudAPI template', {
      to: phone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: language },
        components,
      },
    });
  }

  /**
   * Descarga un adjunto entrante de la Cloud API. Meta devuelve primero una URL
   * temporal (≈5 min) que además exige el access token, por eso hay que bajar el
   * binario en el momento y re-hospedarlo.
   */
  async downloadCloudMedia(
    mediaId: string,
    config: WaConfig,
  ): Promise<{ buffer: Buffer; mimeType: string } | null> {
    try {
      const meta = await this.graph.get<{ url?: string; mime_type?: string }>(
        `/${mediaId}`,
        { accessToken: config.waAccessToken },
      );
      if (!meta.url) throw new Error('respuesta sin url');

      // El binario no vive en Graph: se baja de la URL firmada, con el mismo token.
      const binRes = await fetch(meta.url, {
        headers: { Authorization: `Bearer ${config.waAccessToken}` },
      });
      if (!binRes.ok) throw new Error(`binario ${binRes.status}`);
      return {
        buffer: Buffer.from(await binRes.arrayBuffer()),
        mimeType:
          meta.mime_type ??
          binRes.headers.get('content-type') ??
          'application/octet-stream',
      };
    } catch (err) {
      this.logger.error(
        `No se pudo descargar la media ${mediaId} de Cloud API: ${this.errorMessage(err)}`,
      );
      return null;
    }
  }

  /** Marca el chat como leído (doble check azul) en el proveedor correspondiente. */
  async markAsRead(
    config: WaConfig,
    opts: { chatId?: string; externalId?: string },
  ): Promise<void> {
    try {
      if (config.provider === 'cloudapi' && opts.externalId) {
        await this.graph.post(`/${config.waPhoneNumberId}/messages`, {
          accessToken: config.waAccessToken,
          json: {
            messaging_product: 'whatsapp',
            status: 'read',
            message_id: opts.externalId,
          },
        });
      }
    } catch (err) {
      this.logger.warn(
        `No se pudo marcar como leído: ${this.errorMessage(err)}`,
      );
    }
  }

  /**
   * Bloquea (o desbloquea) al contacto en el propio WhatsApp: deja de poder
   * escribirle al número del negocio. Lanza si el proveedor lo rechaza.
   *
   * Cloud API solo permite bloquear a quien escribió en las últimas 24 h.
   */
  async setContactBlocked(
    config: WaConfig,
    contact: string,
    blocked: boolean,
  ): Promise<void> {
    if (config.provider === 'cloudapi') {
      const path = `/${config.waPhoneNumberId}/block_users`;
      const opts = {
        accessToken: config.waAccessToken,
        json: {
          messaging_product: 'whatsapp',
          block_users: [{ user: this.formatPhone(contact) || contact }],
        },
      };
      try {
        const data = blocked
          ? await this.graph.post<CloudBlockResult>(path, opts)
          : await this.graph.delete<CloudBlockResult>(path, opts);
        const failed = data.block_users?.failed_users?.[0];
        if (failed)
          throw new Error(
            failed.errors?.[0]?.message ?? 'Meta no aplicó el bloqueo',
          );
      } catch (err) {
        if (err instanceof MetaApiError)
          throw new Error(`Cloud API ${err.status}: ${err.message}`);
        throw err;
      }
      return;
    }

    throw new Error('Proveedor de WhatsApp no soportado');
  }

  async getStatus(config: WaConfig): Promise<WaStatus> {
    if (config.provider === 'cloudapi') return this.cloudStatus(config);
    return { provider: 'none', configured: false, connected: false };
  }

  /** Registra el webhook con URL propia por WABA (override_callback_uri) — necesario con múltiples cuentas Cloud API bajo la misma app de Meta. */
  async registerCloudApiWebhook(
    config: WaConfig,
    verifyToken?: string,
  ): Promise<{ success: boolean; message: string }> {
    if (config.provider !== 'cloudapi')
      return { success: false, message: 'Solo aplica a cuentas Cloud API' };
    if (!config.waBusinessAccountId)
      return {
        success: false,
        message: 'Falta el WhatsApp Business Account ID',
      };
    if (!config.webhookUrl)
      return { success: false, message: 'Falta PUBLIC_API_URL en el servidor' };
    try {
      await this.graph.post(`/${config.waBusinessAccountId}/subscribed_apps`, {
        accessToken: config.waAccessToken,
        json: {
          override_callback_uri: config.webhookUrl,
          verify_token: verifyToken ?? '',
        },
      });
      return { success: true, message: 'Webhook suscripto correctamente' };
    } catch (err) {
      return { success: false, message: this.errorMessage(err) };
    }
  }

  private async sendCloudApi(
    to: string,
    body: string,
    config: WaConfig,
    replyTo?: string,
  ): Promise<string | undefined> {
    return this.postCloudApiMessage(config, 'CloudAPI', {
      to,
      type: 'text',
      // Con un link, WhatsApp muestra su tarjeta (título e imagen de la página).
      text: /https?:\/\//.test(body) ? { body, preview_url: true } : { body },
      // Así es como Cloud API enlaza una respuesta con el mensaje citado.
      ...(replyTo ? { context: { message_id: replyTo } } : {}),
    });
  }

  private async sendCloudApiMedia(
    to: string,
    caption: string,
    mediaUrl: string,
    mediaType: 'image' | 'video',
    config: WaConfig,
  ): Promise<string | undefined> {
    const payload =
      mediaType === 'image'
        ? { image: { link: mediaUrl, caption } }
        : { video: { link: mediaUrl, caption } };
    return this.postCloudApiMessage(config, 'CloudAPI media', {
      to,
      type: mediaType,
      ...payload,
    });
  }

  private async sendCloudApiAudio(
    to: string,
    audioUrl: string,
    config: WaConfig,
  ): Promise<string | undefined> {
    return this.postCloudApiMessage(config, 'CloudAPI audio', {
      to,
      type: 'audio',
      audio: { link: audioUrl },
    });
  }

  private async sendCloudApiDocument(
    to: string,
    caption: string,
    docUrl: string,
    config: WaConfig,
  ): Promise<string | undefined> {
    const filename = docUrl.split('/').pop() ?? 'documento';
    return this.postCloudApiMessage(config, 'CloudAPI document', {
      to,
      type: 'document',
      document: { link: docUrl, caption, filename },
    });
  }

  /**
   * POST a /{phoneNumberId}/messages de la Cloud API con el prefijo de error
   * histórico de cada tipo de envío. Devuelve el wamid para rastrear los acks.
   */
  private async postCloudApiMessage(
    config: WaConfig,
    errorLabel: string,
    payload: object,
  ): Promise<string | undefined> {
    try {
      const data = await this.graph.post<CloudSendResult>(
        `/${config.waPhoneNumberId}/messages`,
        {
          accessToken: config.waAccessToken,
          json: { messaging_product: 'whatsapp', ...toRecipient(payload) },
        },
      );
      return data.messages?.[0]?.id;
    } catch (err) {
      if (err instanceof MetaApiError)
        throw new Error(`${errorLabel} ${err.status}: ${err.message}`);
      throw err;
    }
  }

  private async cloudStatus(config: WaConfig): Promise<WaStatus> {
    if (!config.waPhoneNumberId || !config.waAccessToken) {
      return {
        provider: 'cloudapi',
        configured: false,
        connected: false,
        error: 'Phone Number ID o Access Token no configurados',
      };
    }
    try {
      const data = await this.graph.get<{
        display_phone_number?: string;
        verified_name?: string;
      }>(`/${config.waPhoneNumberId}`, {
        accessToken: config.waAccessToken,
        params: { fields: 'display_phone_number,verified_name' },
      });
      return {
        provider: 'cloudapi',
        configured: true,
        connected: true,
        phoneNumber: data.display_phone_number,
        state: data.verified_name,
      };
    } catch (err) {
      return {
        provider: 'cloudapi',
        configured: true,
        connected: false,
        error: this.errorMessage(err),
      };
    }
  }

  private errorMessage(err: unknown): string {
    return err instanceof MetaApiError ? err.message : String(err);
  }

  formatPhone(phone: string): string {
    // Un BSUID (usuario con username, sin teléfono compartido) se usa tal cual:
    // reducirlo a dígitos lo convierte en un número que no existe.
    if (isBsuid(phone)) return phone.trim();
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 8 ? digits : '';
  }
}

/**
 * BSUID de WhatsApp: país ISO + "." + id (p. ej. "PE.1502576394655843" o el
 * de portafolio "US.ENT.5068..."). Lo manda Meta en vez del teléfono cuando el
 * usuario tiene username y no compartió su número con el negocio.
 */
export function isBsuid(value: string | undefined | null): boolean {
  return !!value && /^[A-Z]{2}\.(ENT\.)?[A-Za-z0-9]{1,128}$/.test(value.trim());
}

/** Meta solo acepta teléfonos en `to`; un BSUID va en `recipient`. */
function toRecipient(payload: object): object {
  const { to, ...rest } = payload as { to?: unknown };
  return typeof to === 'string' && isBsuid(to)
    ? { ...rest, recipient: to.trim() }
    : payload;
}

/** Cabecera de la plantilla, tal como hay que reproducirla en cada envío. */
export interface TemplateHeader {
  format?: string;
  /** Para cabeceras IMAGE / VIDEO / DOCUMENT. */
  mediaUrl?: string;
  /** Valor del {{1}} cuando la cabecera es TEXT con variable. */
  text?: string;
}

/**
 * Traduce la cabecera al parámetro que espera Graph. Devuelve null cuando la
 * cabecera no lleva contenido variable (TEXT fijo o plantilla sin cabecera):
 * en ese caso Meta NO admite un componente `header` en el envío.
 */
function buildHeaderParameter(
  header?: TemplateHeader,
): Record<string, unknown> | null {
  const format = header?.format?.toUpperCase();
  if (!format) return null;

  if (format === 'TEXT')
    return header?.text ? { type: 'text', text: header.text } : null;

  if (!header?.mediaUrl) return null;
  if (format === 'IMAGE')
    return { type: 'image', image: { link: header.mediaUrl } };
  if (format === 'VIDEO')
    return { type: 'video', video: { link: header.mediaUrl } };
  if (format === 'DOCUMENT')
    return { type: 'document', document: { link: header.mediaUrl } };
  return null;
}
