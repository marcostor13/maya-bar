import { Injectable, Logger } from '@nestjs/common';

export interface WaConfig {
  provider: string;
  wahaApiUrl?: string;
  wahaApiKey?: string;
  wahaSession?: string;
  waPhoneNumberId?: string;
  waAccessToken?: string;
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

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  async sendMessage(to: string, body: string, config: WaConfig, mediaUrl?: string, mediaType?: WaMediaType): Promise<void> {
    const phone = this.formatPhone(to);
    if (!phone) {
      this.logger.warn(`Skipping WA message — invalid phone: ${to}`);
      return;
    }

    if (mediaUrl && mediaType) {
      if (mediaType === 'audio') {
        if (config.provider === 'waha') return this.sendWahaAudio(phone, mediaUrl, config);
        if (config.provider === 'cloudapi') return this.sendCloudApiAudio(phone, mediaUrl, config);
      } else if (mediaType === 'document') {
        if (config.provider === 'waha') return this.sendWahaDocument(phone, body, mediaUrl, config);
        if (config.provider === 'cloudapi') return this.sendCloudApiDocument(phone, body, mediaUrl, config);
      } else {
        if (config.provider === 'waha') return this.sendWahaMedia(phone, body, mediaUrl, mediaType as 'image' | 'video', config);
        if (config.provider === 'cloudapi') return this.sendCloudApiMedia(phone, body, mediaUrl, mediaType as 'image' | 'video', config);
      }
      this.logger.log(`[MOCK WA MEDIA] To: ${phone} | ${mediaType}: ${mediaUrl}`);
      return;
    }

    if (config.provider === 'waha') {
      await this.sendWaha(phone, body, config);
    } else if (config.provider === 'cloudapi') {
      await this.sendCloudApi(phone, body, config);
    } else {
      this.logger.log(`[MOCK WA] To: ${phone} | ${body.substring(0, 80)}`);
    }
  }

  async sendCloudApiTemplate(to: string, templateName: string, language: string, vars: string[], config: WaConfig): Promise<void> {
    const phone = this.formatPhone(to);
    if (!phone) { this.logger.warn(`Skipping template — invalid phone: ${to}`); return; }
    const url = `https://graph.facebook.com/v19.0/${config.waPhoneNumberId}/messages`;
    const components: object[] = [];
    if (vars.length > 0) {
      components.push({ type: 'body', parameters: vars.map(v => ({ type: 'text', text: v })) });
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.waAccessToken}` },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: { name: templateName, language: { code: language }, components },
      }),
    });
    if (!res.ok) throw new Error(`CloudAPI template ${res.status}: ${await res.text()}`);
  }

  async getStatus(config: WaConfig): Promise<WaStatus> {
    if (config.provider === 'waha') return this.wahaStatus(config);
    if (config.provider === 'cloudapi') return this.cloudStatus(config);
    return { provider: 'none', configured: false, connected: false };
  }

  async getQr(config: WaConfig): Promise<{ qrcode?: string; error?: string }> {
    if (config.provider !== 'waha') return { error: 'QR solo disponible con WAHA' };
    if (!config.wahaApiUrl) return { error: 'Falta la URL de WAHA' };
    const session = config.wahaSession ?? 'default';
    const headers = { 'X-Api-Key': config.wahaApiKey ?? '', 'Content-Type': 'application/json', Accept: 'application/json' };
    try {
      const statusRes = await fetch(`${config.wahaApiUrl}/api/sessions/${session}`, { headers });
      if (!statusRes.ok) return { error: `Sesión "${session}" no encontrada. Créala con POST /api/sessions.` };
      const { status } = await statusRes.json() as { status?: string };
      if (status === 'FAILED' || status === 'STOPPED') {
        if (status === 'FAILED') {
          await fetch(`${config.wahaApiUrl}/api/sessions/${session}/stop`, { method: 'POST', headers });
          await new Promise(r => setTimeout(r, 1000));
        }
        const startRes = await fetch(`${config.wahaApiUrl}/api/sessions/${session}/start`, { method: 'POST', headers });
        if (!startRes.ok) return { error: `No se pudo iniciar la sesión: ${await startRes.text()}` };
      }
      await new Promise(r => setTimeout(r, 2500));
      const qrRes = await fetch(`${config.wahaApiUrl}/api/${session}/auth/qr`, { headers });
      if (!qrRes.ok) return { error: `WAHA ${qrRes.status}: ${await qrRes.text()}` };
      const data = await qrRes.json() as { data?: string };
      return data.data ? { qrcode: data.data } : { error: 'QR no disponible aún. Intenta de nuevo.' };
    } catch (err) {
      return { error: String(err) };
    }
  }

  private async sendWaha(to: string, body: string, config: WaConfig): Promise<void> {
    const session = config.wahaSession ?? 'default';
    const res = await fetch(`${config.wahaApiUrl}/api/sendText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': config.wahaApiKey ?? '' },
      body: JSON.stringify({ session, chatId: `${to}@c.us`, text: body }),
    });
    if (!res.ok) throw new Error(`WAHA ${res.status}: ${await res.text()}`);
  }

  private async sendWahaMedia(to: string, caption: string, mediaUrl: string, mediaType: 'image' | 'video', config: WaConfig): Promise<void> {
    const session = config.wahaSession ?? 'default';
    const chatId = `${to}@c.us`;
    const isImage = mediaType === 'image';
    const endpoint = isImage ? 'sendImage' : 'sendFile';
    const mimetype = isImage ? 'image/jpeg' : 'video/mp4';
    const filename = isImage ? 'imagen.jpg' : 'video.mp4';
    const res = await fetch(`${config.wahaApiUrl}/api/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': config.wahaApiKey ?? '' },
      body: JSON.stringify({ session, chatId, caption, file: { mimetype, filename, url: mediaUrl } }),
    });
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 422 && text.includes('Plus')) {
        this.logger.warn(`WAHA media not supported (free tier), falling back to text+link for ${to}`);
        await this.sendWaha(to, `${caption}\n${mediaUrl}`, config);
        return;
      }
      throw new Error(`WAHA media ${res.status}: ${text}`);
    }
  }

  private async sendWahaAudio(to: string, audioUrl: string, config: WaConfig): Promise<void> {
    const session = config.wahaSession ?? 'default';
    const chatId = `${to}@c.us`;
    const res = await fetch(`${config.wahaApiUrl}/api/sendVoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': config.wahaApiKey ?? '' },
      body: JSON.stringify({ session, chatId, file: { url: audioUrl } }),
    });
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 422 && text.includes('Plus')) {
        this.logger.warn(`WAHA audio requires Plus, sending as link for ${to}`);
        await this.sendWaha(to, `🎵 Audio: ${audioUrl}`, config);
        return;
      }
      throw new Error(`WAHA audio ${res.status}: ${text}`);
    }
  }

  private async sendWahaDocument(to: string, caption: string, docUrl: string, config: WaConfig): Promise<void> {
    const session = config.wahaSession ?? 'default';
    const chatId = `${to}@c.us`;
    const filename = docUrl.split('/').pop() ?? 'documento';
    const res = await fetch(`${config.wahaApiUrl}/api/sendFile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': config.wahaApiKey ?? '' },
      body: JSON.stringify({ session, chatId, caption, file: { url: docUrl, filename } }),
    });
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 422 && text.includes('Plus')) {
        this.logger.warn(`WAHA document requires Plus, sending as link for ${to}`);
        await this.sendWaha(to, `📄 ${caption}\n${docUrl}`, config);
        return;
      }
      throw new Error(`WAHA document ${res.status}: ${text}`);
    }
  }

  private async sendCloudApi(to: string, body: string, config: WaConfig): Promise<void> {
    const url = `https://graph.facebook.com/v19.0/${config.waPhoneNumberId}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.waAccessToken}` },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
    });
    if (!res.ok) throw new Error(`CloudAPI ${res.status}: ${await res.text()}`);
  }

  private async sendCloudApiMedia(to: string, caption: string, mediaUrl: string, mediaType: 'image' | 'video', config: WaConfig): Promise<void> {
    const url = `https://graph.facebook.com/v19.0/${config.waPhoneNumberId}/messages`;
    const payload = mediaType === 'image'
      ? { image: { link: mediaUrl, caption } }
      : { video: { link: mediaUrl, caption } };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.waAccessToken}` },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: mediaType, ...payload }),
    });
    if (!res.ok) throw new Error(`CloudAPI media ${res.status}: ${await res.text()}`);
  }

  private async sendCloudApiAudio(to: string, audioUrl: string, config: WaConfig): Promise<void> {
    const url = `https://graph.facebook.com/v19.0/${config.waPhoneNumberId}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.waAccessToken}` },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'audio', audio: { link: audioUrl } }),
    });
    if (!res.ok) throw new Error(`CloudAPI audio ${res.status}: ${await res.text()}`);
  }

  private async sendCloudApiDocument(to: string, caption: string, docUrl: string, config: WaConfig): Promise<void> {
    const url = `https://graph.facebook.com/v19.0/${config.waPhoneNumberId}/messages`;
    const filename = docUrl.split('/').pop() ?? 'documento';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.waAccessToken}` },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to, type: 'document',
        document: { link: docUrl, caption, filename },
      }),
    });
    if (!res.ok) throw new Error(`CloudAPI document ${res.status}: ${await res.text()}`);
  }

  private async wahaStatus(config: WaConfig): Promise<WaStatus> {
    if (!config.wahaApiUrl) {
      return { provider: 'waha', configured: false, connected: false, error: 'URL no configurada' };
    }
    const session = config.wahaSession ?? 'default';
    try {
      const res = await fetch(
        `${config.wahaApiUrl}/api/sessions/${session}`,
        { headers: { 'X-Api-Key': config.wahaApiKey ?? '' } },
      );
      const data = await res.json() as { name?: string; status?: string };
      const state = data.status ?? 'UNKNOWN';
      return { provider: 'waha', configured: true, connected: state === 'WORKING', instance: session, state };
    } catch (err) {
      return { provider: 'waha', configured: true, connected: false, error: String(err) };
    }
  }

  private async cloudStatus(config: WaConfig): Promise<WaStatus> {
    if (!config.waPhoneNumberId || !config.waAccessToken) {
      return { provider: 'cloudapi', configured: false, connected: false, error: 'Phone Number ID o Access Token no configurados' };
    }
    try {
      const res = await fetch(
        `https://graph.facebook.com/v19.0/${config.waPhoneNumberId}?fields=display_phone_number,verified_name`,
        { headers: { Authorization: `Bearer ${config.waAccessToken}` } },
      );
      const data = await res.json() as { display_phone_number?: string; verified_name?: string; error?: { message?: string } };
      if (data.error) throw new Error(data.error.message);
      return { provider: 'cloudapi', configured: true, connected: true, phoneNumber: data.display_phone_number, state: data.verified_name };
    } catch (err) {
      return { provider: 'cloudapi', configured: true, connected: false, error: String(err) };
    }
  }

  formatPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 8 ? digits : '';
  }
}
