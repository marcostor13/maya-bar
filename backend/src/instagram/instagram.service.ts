import { Injectable, Logger } from '@nestjs/common';
import { MetaGraphClient, MetaApiError } from '../shared/meta-graph.client';

export interface IgConfig {
  igBusinessAccountId?: string; // Instagram User ID (IG_ID) de la cuenta profesional
  pageId?: string; // solo informativo si la cuenta viene del flujo clásico ligado a una Página de FB
  pageAccessToken?: string; // Instagram User Access Token (flujo "Instagram API with Instagram Login")
  verifyToken?: string;
}

export interface IgStatus {
  configured: boolean;
  connected: boolean;
  username?: string;
  error?: string;
}

export type IgMediaType = 'image' | 'video' | 'audio' | 'document';

// Instagram API with Instagram Login — no requiere Página de Facebook vinculada.
const IG_HOST = 'https://graph.instagram.com';

@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);

  constructor(private readonly graph: MetaGraphClient) {}

  /** Envía un DM de Instagram. `to` es el Instagram-Scoped ID (IGSID) del contacto. */
  async sendMessage(
    to: string,
    body: string,
    config: IgConfig,
    mediaUrl?: string,
    mediaType?: IgMediaType,
  ): Promise<void> {
    if (!to) {
      this.logger.warn('Skipping IG message — missing recipient IGSID');
      return;
    }
    if (!config.pageAccessToken || !config.igBusinessAccountId) {
      this.logger.log(`[MOCK IG] To: ${to} | ${body.substring(0, 80)}`);
      return;
    }

    if (mediaUrl && mediaType) {
      await this.sendAttachment(to, mediaUrl, mediaType, config);
      return;
    }

    await this.post(config, {
      recipient: { id: to },
      messaging_type: 'RESPONSE',
      message: { text: body },
    });
  }

  private async sendAttachment(
    to: string,
    mediaUrl: string,
    mediaType: IgMediaType,
    config: IgConfig,
  ): Promise<void> {
    const type = mediaType === 'document' ? 'file' : mediaType;
    await this.post(config, {
      recipient: { id: to },
      messaging_type: 'RESPONSE',
      message: {
        attachment: { type, payload: { url: mediaUrl, is_reusable: true } },
      },
    });
  }

  private async post(config: IgConfig, payload: object): Promise<void> {
    await this.graph.post(`/${config.igBusinessAccountId}/messages`, {
      host: IG_HOST,
      accessToken: config.pageAccessToken,
      json: payload,
    });
  }

  /** Suscribe la cuenta al webhook de la app (obligatorio: Meta no envía eventos hasta que se llama esto). */
  async subscribeWebhook(
    config: IgConfig,
  ): Promise<{ success: boolean; message: string }> {
    if (!config.pageAccessToken)
      return { success: false, message: 'Falta el access token' };
    try {
      await this.graph.post('/me/subscribed_apps', {
        host: IG_HOST,
        accessToken: config.pageAccessToken,
        params: { subscribed_fields: 'messages' },
      });
      return { success: true, message: 'Webhook suscripto correctamente' };
    } catch (err) {
      return { success: false, message: this.errorMessage(err) };
    }
  }

  async getStatus(config: IgConfig): Promise<IgStatus> {
    if (!config.igBusinessAccountId || !config.pageAccessToken) {
      return {
        configured: false,
        connected: false,
        error: 'Faltan Instagram User ID o Access Token',
      };
    }
    try {
      const data = await this.graph.get<{ username?: string }>(
        `/${config.igBusinessAccountId}`,
        {
          host: IG_HOST,
          accessToken: config.pageAccessToken,
          params: { fields: 'username' },
        },
      );
      return { configured: true, connected: true, username: data.username };
    } catch (err) {
      return {
        configured: true,
        connected: false,
        error: this.errorMessage(err),
      };
    }
  }

  private errorMessage(err: unknown): string {
    return err instanceof MetaApiError ? err.message : String(err);
  }
}
