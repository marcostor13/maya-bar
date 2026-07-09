import { Injectable, Logger } from '@nestjs/common';

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
const GRAPH_URL = 'https://graph.instagram.com/v21.0';

@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);

  /** Envía un DM de Instagram. `to` es el Instagram-Scoped ID (IGSID) del contacto. */
  async sendMessage(to: string, body: string, config: IgConfig, mediaUrl?: string, mediaType?: IgMediaType): Promise<void> {
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

    await this.post(config, { recipient: { id: to }, messaging_type: 'RESPONSE', message: { text: body } });
  }

  private async sendAttachment(to: string, mediaUrl: string, mediaType: IgMediaType, config: IgConfig): Promise<void> {
    const type = mediaType === 'document' ? 'file' : mediaType;
    await this.post(config, {
      recipient: { id: to },
      messaging_type: 'RESPONSE',
      message: { attachment: { type, payload: { url: mediaUrl, is_reusable: true } } },
    });
  }

  private async post(config: IgConfig, payload: object): Promise<void> {
    const url = `${GRAPH_URL}/${config.igBusinessAccountId}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.pageAccessToken}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Instagram ${res.status}: ${await res.text()}`);
  }

  /** Suscribe la cuenta al webhook de la app (obligatorio: Meta no envía eventos hasta que se llama esto). */
  async subscribeWebhook(config: IgConfig): Promise<{ success: boolean; message: string }> {
    if (!config.pageAccessToken) return { success: false, message: 'Falta el access token' };
    const params = new URLSearchParams({ subscribed_fields: 'messages', access_token: config.pageAccessToken });
    try {
      const res = await fetch(`${GRAPH_URL}/me/subscribed_apps?${params.toString()}`, { method: 'POST' });
      const data = await res.json() as { success?: boolean; error?: { message?: string } };
      if (!res.ok || data.error) return { success: false, message: data.error?.message ?? `Error ${res.status}` };
      return { success: true, message: 'Webhook suscripto correctamente' };
    } catch (err) {
      return { success: false, message: String(err) };
    }
  }

  async getStatus(config: IgConfig): Promise<IgStatus> {
    if (!config.igBusinessAccountId || !config.pageAccessToken) {
      return { configured: false, connected: false, error: 'Faltan Instagram User ID o Access Token' };
    }
    try {
      const res = await fetch(
        `${GRAPH_URL}/${config.igBusinessAccountId}?fields=username`,
        { headers: { Authorization: `Bearer ${config.pageAccessToken}` } },
      );
      const data = await res.json() as { username?: string; error?: { message?: string } };
      if (data.error) throw new Error(data.error.message);
      return { configured: true, connected: true, username: data.username };
    } catch (err) {
      return { configured: true, connected: false, error: String(err) };
    }
  }
}
