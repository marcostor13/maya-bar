import { Injectable, Logger } from '@nestjs/common';
import { MetaGraphClient, MetaApiError } from '../shared/meta-graph.client';

export interface MsConfig {
  pageId?: string; // ID de la Página de Facebook
  pageAccessToken?: string; // Page Access Token (derivado de un token de usuario de larga duración)
}

export interface MsStatus {
  configured: boolean;
  connected: boolean;
  name?: string;
  error?: string;
}

export type MsMediaType = 'image' | 'video' | 'audio' | 'document';

/** Campos del webhook que hacen falta para recibir DMs y sus acks. */
const SUBSCRIBED_FIELDS = [
  'messages',
  'messaging_postbacks',
  'message_echoes',
  'message_reads',
].join(',');

/**
 * Messenger (DMs de una Página de Facebook) sobre la Meta Graph API.
 *
 * A diferencia de Instagram, el endpoint de envío cuelga de la Página
 * (`/{page-id}/messages`) y el destinatario es el PSID (Page-Scoped ID) que
 * llega en el webhook.
 */
@Injectable()
export class MessengerService {
  private readonly logger = new Logger(MessengerService.name);

  constructor(private readonly graph: MetaGraphClient) {}

  /** Envía un mensaje de Messenger. `to` es el PSID del contacto. Devuelve el id de Meta. */
  async sendMessage(
    to: string,
    body: string,
    config: MsConfig,
    mediaUrl?: string,
    mediaType?: MsMediaType,
  ): Promise<string | undefined> {
    if (!to) {
      this.logger.warn('Skipping Messenger message — missing recipient PSID');
      return undefined;
    }
    if (!config.pageAccessToken || !config.pageId) {
      this.logger.log(`[MOCK MS] To: ${to} | ${body.substring(0, 80)}`);
      return undefined;
    }

    if (mediaUrl && mediaType) {
      return this.sendAttachment(to, mediaUrl, mediaType, config);
    }

    return this.post(config, {
      recipient: { id: to },
      messaging_type: 'RESPONSE',
      message: { text: body },
    });
  }

  private async sendAttachment(
    to: string,
    mediaUrl: string,
    mediaType: MsMediaType,
    config: MsConfig,
  ): Promise<string | undefined> {
    const type = mediaType === 'document' ? 'file' : mediaType;
    return this.post(config, {
      recipient: { id: to },
      messaging_type: 'RESPONSE',
      message: {
        attachment: { type, payload: { url: mediaUrl, is_reusable: true } },
      },
    });
  }

  /** Burbuja de "escribiendo…" en el chat del cliente. Nunca rompe el envío. */
  async setTyping(config: MsConfig, to: string, on: boolean): Promise<void> {
    if (!config.pageAccessToken || !config.pageId || !to) return;
    try {
      await this.post(config, {
        recipient: { id: to },
        sender_action: on ? 'typing_on' : 'typing_off',
      });
    } catch (err) {
      this.logger.warn(`No se pudo marcar typing en Messenger: ${String(err)}`);
    }
  }

  /** Marca el chat como visto en Messenger (doble check del cliente). */
  async markSeen(config: MsConfig, to: string): Promise<void> {
    if (!config.pageAccessToken || !config.pageId || !to) return;
    try {
      await this.post(config, {
        recipient: { id: to },
        sender_action: 'mark_seen',
      });
    } catch (err) {
      this.logger.warn(
        `No se pudo marcar como leído en Messenger: ${String(err)}`,
      );
    }
  }

  private async post(
    config: MsConfig,
    payload: object,
  ): Promise<string | undefined> {
    const data = await this.graph.post<{ message_id?: string }>(
      `/${config.pageId}/messages`,
      { accessToken: config.pageAccessToken, json: payload },
    );
    return data?.message_id;
  }

  /** Suscribe la Página al webhook de la app: sin esto Meta no envía ningún evento. */
  async subscribeWebhook(
    config: MsConfig,
  ): Promise<{ success: boolean; message: string }> {
    if (!config.pageAccessToken || !config.pageId)
      return { success: false, message: 'Faltan Page ID o access token' };
    try {
      await this.graph.post(`/${config.pageId}/subscribed_apps`, {
        accessToken: config.pageAccessToken,
        params: { subscribed_fields: SUBSCRIBED_FIELDS },
      });
      return { success: true, message: 'Webhook suscripto correctamente' };
    } catch (err) {
      return { success: false, message: this.errorMessage(err) };
    }
  }

  async getStatus(config: MsConfig): Promise<MsStatus> {
    if (!config.pageId || !config.pageAccessToken) {
      return {
        configured: false,
        connected: false,
        error: 'Faltan Page ID o Access Token',
      };
    }
    try {
      const data = await this.graph.get<{ name?: string }>(
        `/${config.pageId}`,
        { accessToken: config.pageAccessToken, params: { fields: 'name' } },
      );
      return { configured: true, connected: true, name: data.name };
    } catch (err) {
      return {
        configured: true,
        connected: false,
        error: this.errorMessage(err),
      };
    }
  }

  /** Nombre y foto del contacto a partir de su PSID (si la Página tiene el permiso). */
  async fetchContactProfile(
    psid: string,
    config: MsConfig,
  ): Promise<{ name?: string; avatar?: string }> {
    if (!config.pageAccessToken || !psid) return {};
    try {
      const data = await this.graph.get<{
        name?: string;
        first_name?: string;
        last_name?: string;
        profile_pic?: string;
      }>(`/${psid}`, {
        accessToken: config.pageAccessToken,
        params: { fields: 'name,first_name,last_name,profile_pic' },
      });
      const name =
        data.name ||
        [data.first_name, data.last_name].filter(Boolean).join(' ').trim();
      return { name: name || undefined, avatar: data.profile_pic };
    } catch {
      // El perfil es opcional: si Meta no lo da, el chat se muestra con el PSID.
      return {};
    }
  }

  private errorMessage(err: unknown): string {
    return err instanceof MetaApiError ? err.message : String(err);
  }
}
