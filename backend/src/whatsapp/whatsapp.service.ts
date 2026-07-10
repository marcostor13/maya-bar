import { Injectable, Logger } from '@nestjs/common';
import { MetaGraphClient, MetaApiError } from '../shared/meta-graph.client';

export interface WaConfig {
  provider: string;
  wahaApiUrl?: string;
  wahaApiKey?: string;
  wahaSession?: string;
  waPhoneNumberId?: string;
  waAccessToken?: string;
  waBusinessAccountId?: string;
  webhookUrl?: string; // URL a la que WAHA/Cloud API debe reenviar los mensajes entrantes
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

  constructor(private readonly graph: MetaGraphClient) {}

  async sendMessage(
    to: string,
    body: string,
    config: WaConfig,
    mediaUrl?: string,
    mediaType?: WaMediaType,
  ): Promise<void> {
    const phone = this.formatPhone(to);
    if (!phone) {
      this.logger.warn(`Skipping WA message — invalid phone: ${to}`);
      return;
    }

    if (mediaUrl && mediaType) {
      if (mediaType === 'audio') {
        if (config.provider === 'waha')
          return this.sendWahaAudio(phone, mediaUrl, config);
        if (config.provider === 'cloudapi')
          return this.sendCloudApiAudio(phone, mediaUrl, config);
      } else if (mediaType === 'document') {
        if (config.provider === 'waha')
          return this.sendWahaDocument(phone, body, mediaUrl, config);
        if (config.provider === 'cloudapi')
          return this.sendCloudApiDocument(phone, body, mediaUrl, config);
      } else {
        if (config.provider === 'waha')
          return this.sendWahaMedia(phone, body, mediaUrl, mediaType, config);
        if (config.provider === 'cloudapi')
          return this.sendCloudApiMedia(
            phone,
            body,
            mediaUrl,
            mediaType,
            config,
          );
      }
      this.logger.log(
        `[MOCK WA MEDIA] To: ${phone} | ${mediaType}: ${mediaUrl}`,
      );
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

  async sendCloudApiTemplate(
    to: string,
    templateName: string,
    language: string,
    vars: string[],
    config: WaConfig,
  ): Promise<void> {
    const phone = this.formatPhone(to);
    if (!phone) {
      this.logger.warn(`Skipping template — invalid phone: ${to}`);
      return;
    }
    const components: object[] = [];
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

  async getStatus(config: WaConfig): Promise<WaStatus> {
    if (config.provider === 'waha') return this.wahaStatus(config);
    if (config.provider === 'cloudapi') return this.cloudStatus(config);
    return { provider: 'none', configured: false, connected: false };
  }

  /** Registra (o vuelve a registrar) el webhook entrante en la sesión de WAHA. */
  async ensureWahaWebhook(
    config: WaConfig,
  ): Promise<{ success: boolean; message: string }> {
    if (config.provider !== 'waha')
      return { success: false, message: 'Solo aplica a cuentas WAHA' };
    if (!config.wahaApiUrl)
      return { success: false, message: 'Falta la URL de WAHA' };
    if (!config.webhookUrl)
      return { success: false, message: 'Falta PUBLIC_API_URL en el servidor' };
    const session = config.wahaSession ?? 'default';
    const headers = {
      'X-Api-Key': config.wahaApiKey ?? '',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    const hook = { url: config.webhookUrl, events: ['message'] };
    try {
      const statusRes = await fetch(
        `${config.wahaApiUrl}/api/sessions/${session}`,
        { headers },
      );
      if (statusRes.status === 404) {
        const createRes = await fetch(`${config.wahaApiUrl}/api/sessions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            name: session,
            start: true,
            config: { webhooks: [hook] },
          }),
        });
        if (!createRes.ok)
          return {
            success: false,
            message: `No se pudo crear la sesión: ${await createRes.text()}`,
          };
        return {
          success: true,
          message:
            'Sesión creada y webhook registrado. Escanea el QR para conectar.',
        };
      }
      if (!statusRes.ok)
        return {
          success: false,
          message: `WAHA ${statusRes.status}: ${await statusRes.text()}`,
        };
      const data = (await statusRes.json()) as {
        config?: { webhooks?: { url?: string }[] };
      };
      const webhooks = [
        ...(data.config?.webhooks ?? []).filter((w) => w.url !== hook.url),
        hook,
      ];
      const putRes = await fetch(
        `${config.wahaApiUrl}/api/sessions/${session}`,
        {
          method: 'PUT',
          headers,
          body: JSON.stringify({ config: { webhooks } }),
        },
      );
      if (!putRes.ok)
        return {
          success: false,
          message: `No se pudo actualizar el webhook: ${await putRes.text()}`,
        };
      await fetch(`${config.wahaApiUrl}/api/sessions/${session}/restart`, {
        method: 'POST',
        headers,
      }).catch(() => undefined);
      return {
        success: true,
        message: 'Webhook registrado correctamente. Ya recibirás los mensajes.',
      };
    } catch (err) {
      return { success: false, message: String(err) };
    }
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

  async getQr(config: WaConfig): Promise<{ qrcode?: string; error?: string }> {
    if (config.provider !== 'waha')
      return { error: 'QR solo disponible con WAHA' };
    if (!config.wahaApiUrl) return { error: 'Falta la URL de WAHA' };
    const session = config.wahaSession ?? 'default';
    const headers = {
      'X-Api-Key': config.wahaApiKey ?? '',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    const hook = config.webhookUrl
      ? { url: config.webhookUrl, events: ['message'] }
      : null;
    try {
      let status: string | undefined;
      const statusRes = await fetch(
        `${config.wahaApiUrl}/api/sessions/${session}`,
        { headers },
      );
      if (!statusRes.ok) {
        if (statusRes.status === 404) {
          const createRes = await fetch(`${config.wahaApiUrl}/api/sessions`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              name: session,
              start: true,
              config: hook ? { webhooks: [hook] } : undefined,
            }),
          });
          if (!createRes.ok)
            return {
              error: `No se pudo crear la sesión "${session}": ${await createRes.text()}`,
            };
          await new Promise((r) => setTimeout(r, 2500));
        } else {
          return {
            error: `WAHA ${statusRes.status}: ${await statusRes.text()}`,
          };
        }
      } else {
        const data = (await statusRes.json()) as {
          status?: string;
          config?: { webhooks?: { url?: string }[] };
        };
        status = data.status;
        // Asegura que el webhook esté registrado (idempotente: solo parchea si falta).
        if (
          hook &&
          !(data.config?.webhooks ?? []).some((w) => w.url === hook.url)
        ) {
          const webhooks = [
            ...(data.config?.webhooks ?? []).filter((w) => w.url !== hook.url),
            hook,
          ];
          await fetch(`${config.wahaApiUrl}/api/sessions/${session}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ config: { webhooks } }),
          }).catch(() => undefined);
          await fetch(`${config.wahaApiUrl}/api/sessions/${session}/restart`, {
            method: 'POST',
            headers,
          }).catch(() => undefined);
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
      if (status === 'WORKING') {
        return {
          error:
            'La sesión ya está conectada. Webhook configurado — ya recibirás los mensajes.',
        };
      }
      if (status === 'FAILED' || status === 'STOPPED') {
        if (status === 'FAILED') {
          await fetch(`${config.wahaApiUrl}/api/sessions/${session}/stop`, {
            method: 'POST',
            headers,
          });
          await new Promise((r) => setTimeout(r, 1000));
        }
        const startRes = await fetch(
          `${config.wahaApiUrl}/api/sessions/${session}/start`,
          { method: 'POST', headers },
        );
        if (!startRes.ok)
          return {
            error: `No se pudo iniciar la sesión: ${await startRes.text()}`,
          };
      }
      await new Promise((r) => setTimeout(r, 2500));
      const qrRes = await fetch(`${config.wahaApiUrl}/api/${session}/auth/qr`, {
        headers,
      });
      if (!qrRes.ok)
        return { error: `WAHA ${qrRes.status}: ${await qrRes.text()}` };
      const data = (await qrRes.json()) as { data?: string };
      return data.data
        ? { qrcode: data.data }
        : { error: 'QR no disponible aún. Intenta de nuevo.' };
    } catch (err) {
      return { error: String(err) };
    }
  }

  private async sendWaha(
    to: string,
    body: string,
    config: WaConfig,
  ): Promise<void> {
    const session = config.wahaSession ?? 'default';
    const res = await fetch(`${config.wahaApiUrl}/api/sendText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': config.wahaApiKey ?? '',
      },
      body: JSON.stringify({ session, chatId: `${to}@c.us`, text: body }),
    });
    if (!res.ok) throw new Error(`WAHA ${res.status}: ${await res.text()}`);
  }

  private async sendWahaMedia(
    to: string,
    caption: string,
    mediaUrl: string,
    mediaType: 'image' | 'video',
    config: WaConfig,
  ): Promise<void> {
    const session = config.wahaSession ?? 'default';
    const chatId = `${to}@c.us`;
    const isImage = mediaType === 'image';
    const endpoint = isImage ? 'sendImage' : 'sendFile';
    const mimetype = isImage ? 'image/jpeg' : 'video/mp4';
    const filename = isImage ? 'imagen.jpg' : 'video.mp4';
    const res = await fetch(`${config.wahaApiUrl}/api/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': config.wahaApiKey ?? '',
      },
      body: JSON.stringify({
        session,
        chatId,
        caption,
        file: { mimetype, filename, url: mediaUrl },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 422 && text.includes('Plus')) {
        this.logger.warn(
          `WAHA media not supported (free tier), falling back to text+link for ${to}`,
        );
        await this.sendWaha(to, `${caption}\n${mediaUrl}`, config);
        return;
      }
      throw new Error(`WAHA media ${res.status}: ${text}`);
    }
  }

  private async sendWahaAudio(
    to: string,
    audioUrl: string,
    config: WaConfig,
  ): Promise<void> {
    const session = config.wahaSession ?? 'default';
    const chatId = `${to}@c.us`;
    const res = await fetch(`${config.wahaApiUrl}/api/sendVoice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': config.wahaApiKey ?? '',
      },
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

  private async sendWahaDocument(
    to: string,
    caption: string,
    docUrl: string,
    config: WaConfig,
  ): Promise<void> {
    const session = config.wahaSession ?? 'default';
    const chatId = `${to}@c.us`;
    const filename = docUrl.split('/').pop() ?? 'documento';
    const res = await fetch(`${config.wahaApiUrl}/api/sendFile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': config.wahaApiKey ?? '',
      },
      body: JSON.stringify({
        session,
        chatId,
        caption,
        file: { url: docUrl, filename },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 422 && text.includes('Plus')) {
        this.logger.warn(
          `WAHA document requires Plus, sending as link for ${to}`,
        );
        await this.sendWaha(to, `📄 ${caption}\n${docUrl}`, config);
        return;
      }
      throw new Error(`WAHA document ${res.status}: ${text}`);
    }
  }

  private async sendCloudApi(
    to: string,
    body: string,
    config: WaConfig,
  ): Promise<void> {
    await this.postCloudApiMessage(config, 'CloudAPI', {
      to,
      type: 'text',
      text: { body },
    });
  }

  private async sendCloudApiMedia(
    to: string,
    caption: string,
    mediaUrl: string,
    mediaType: 'image' | 'video',
    config: WaConfig,
  ): Promise<void> {
    const payload =
      mediaType === 'image'
        ? { image: { link: mediaUrl, caption } }
        : { video: { link: mediaUrl, caption } };
    await this.postCloudApiMessage(config, 'CloudAPI media', {
      to,
      type: mediaType,
      ...payload,
    });
  }

  private async sendCloudApiAudio(
    to: string,
    audioUrl: string,
    config: WaConfig,
  ): Promise<void> {
    await this.postCloudApiMessage(config, 'CloudAPI audio', {
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
  ): Promise<void> {
    const filename = docUrl.split('/').pop() ?? 'documento';
    await this.postCloudApiMessage(config, 'CloudAPI document', {
      to,
      type: 'document',
      document: { link: docUrl, caption, filename },
    });
  }

  /** POST a /{phoneNumberId}/messages de la Cloud API con el prefijo de error histórico de cada tipo de envío. */
  private async postCloudApiMessage(
    config: WaConfig,
    errorLabel: string,
    payload: object,
  ): Promise<void> {
    try {
      await this.graph.post(`/${config.waPhoneNumberId}/messages`, {
        accessToken: config.waAccessToken,
        json: { messaging_product: 'whatsapp', ...payload },
      });
    } catch (err) {
      if (err instanceof MetaApiError)
        throw new Error(`${errorLabel} ${err.status}: ${err.message}`);
      throw err;
    }
  }

  private async wahaStatus(config: WaConfig): Promise<WaStatus> {
    if (!config.wahaApiUrl) {
      return {
        provider: 'waha',
        configured: false,
        connected: false,
        error: 'URL no configurada',
      };
    }
    const session = config.wahaSession ?? 'default';
    try {
      const res = await fetch(`${config.wahaApiUrl}/api/sessions/${session}`, {
        headers: { 'X-Api-Key': config.wahaApiKey ?? '' },
      });
      const data = (await res.json()) as { name?: string; status?: string };
      const state = data.status ?? 'UNKNOWN';
      return {
        provider: 'waha',
        configured: true,
        connected: state === 'WORKING',
        instance: session,
        state,
      };
    } catch (err) {
      return {
        provider: 'waha',
        configured: true,
        connected: false,
        error: String(err),
      };
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
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 8 ? digits : '';
  }
}
