import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface WaOAuthPublicConfig {
  appId?: string;
  configId?: string;
}

export interface WaLongLivedToken {
  accessToken: string;
  expiresIn: number; // segundos
}

const GRAPH_URL = 'https://graph.facebook.com/v21.0';
// PIN interno de verificación en dos pasos del número (Cloud API) — no lo ve el usuario final.
const REGISTER_PIN = '112233';

@Injectable()
export class WhatsAppOAuthService {
  constructor(private config: ConfigService) {}

  private appId(): string {
    const id = this.config.get<string>('FACEBOOK_APP_ID');
    if (!id)
      throw new BadRequestException(
        'FACEBOOK_APP_ID no configurado en el servidor',
      );
    return id;
  }

  private appSecret(): string {
    const secret = this.config.get<string>('FACEBOOK_APP_SECRET');
    if (!secret)
      throw new BadRequestException(
        'FACEBOOK_APP_SECRET no configurado en el servidor',
      );
    return secret;
  }

  /** Datos públicos (no secretos) que el frontend necesita para abrir el popup de Embedded Signup. */
  getPublicConfig(): WaOAuthPublicConfig {
    return {
      appId: this.config.get<string>('FACEBOOK_APP_ID'),
      configId: this.config.get<string>('FACEBOOK_LOGIN_CONFIG_ID'),
    };
  }

  /** Canjea el `code` que devuelve el SDK de Facebook (Embedded Signup) por un token corto. */
  async exchangeCodeForToken(code: string): Promise<{ accessToken: string }> {
    const params = new URLSearchParams({
      client_id: this.appId(),
      client_secret: this.appSecret(),
      code,
    });
    const res = await fetch(
      `${GRAPH_URL}/oauth/access_token?${params.toString()}`,
    );
    const data = (await res.json()) as {
      access_token?: string;
      error?: { message?: string };
    };
    if (!res.ok || !data.access_token)
      throw new BadRequestException(
        data.error?.message ?? 'No se pudo canjear el código de autorización',
      );
    return { accessToken: data.access_token };
  }

  /** Extiende el token a uno de larga duración (~60 días, renovable). */
  async exchangeForLongLivedToken(
    shortLivedToken: string,
  ): Promise<WaLongLivedToken> {
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: this.appId(),
      client_secret: this.appSecret(),
      fb_exchange_token: shortLivedToken,
    });
    const res = await fetch(
      `${GRAPH_URL}/oauth/access_token?${params.toString()}`,
    );
    const data = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: { message?: string };
    };
    if (!res.ok || !data.access_token)
      throw new BadRequestException(
        data.error?.message ?? 'No se pudo generar el token de larga duración',
      );
    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in ?? 5184000,
    };
  }

  /** Registra el número para uso con Cloud API (habilita verificación en 2 pasos si no estaba activa). */
  async registerPhoneNumber(
    phoneNumberId: string,
    accessToken: string,
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const res = await fetch(`${GRAPH_URL}/${phoneNumberId}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          pin: REGISTER_PIN,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: { message?: string };
      };
      if (!res.ok && !data.success)
        return { success: false, message: data.error?.message };
      return { success: true };
    } catch (err) {
      return { success: false, message: String(err) };
    }
  }

  async fetchPhoneNumberInfo(
    phoneNumberId: string,
    accessToken: string,
  ): Promise<{ displayPhoneNumber?: string; verifiedName?: string }> {
    try {
      const res = await fetch(
        `${GRAPH_URL}/${phoneNumberId}?fields=display_phone_number,verified_name`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      const data = (await res.json()) as {
        display_phone_number?: string;
        verified_name?: string;
      };
      return {
        displayPhoneNumber: data.display_phone_number,
        verifiedName: data.verified_name,
      };
    } catch {
      return {};
    }
  }
}
