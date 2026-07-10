import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetaGraphClient, MetaApiError } from '../shared/meta-graph.client';

export interface WaOAuthPublicConfig {
  appId?: string;
  configId?: string;
}

export interface WaLongLivedToken {
  accessToken: string;
  expiresIn: number; // segundos
}

// PIN interno de verificación en dos pasos del número (Cloud API) — no lo ve el usuario final.
const REGISTER_PIN = '112233';

@Injectable()
export class WhatsAppOAuthService {
  constructor(
    private config: ConfigService,
    private graph: MetaGraphClient,
  ) {}

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
    const data = await this.request<{ access_token?: string }>(
      'No se pudo canjear el código de autorización',
      () =>
        this.graph.get('/oauth/access_token', {
          params: {
            client_id: this.appId(),
            client_secret: this.appSecret(),
            code,
          },
        }),
    );
    if (!data.access_token)
      throw new BadRequestException(
        'No se pudo canjear el código de autorización',
      );
    return { accessToken: data.access_token };
  }

  /** Extiende el token a uno de larga duración (~60 días, renovable). */
  async exchangeForLongLivedToken(
    shortLivedToken: string,
  ): Promise<WaLongLivedToken> {
    const data = await this.request<{
      access_token?: string;
      expires_in?: number;
    }>('No se pudo generar el token de larga duración', () =>
      this.graph.get('/oauth/access_token', {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: this.appId(),
          client_secret: this.appSecret(),
          fb_exchange_token: shortLivedToken,
        },
      }),
    );
    if (!data.access_token)
      throw new BadRequestException(
        'No se pudo generar el token de larga duración',
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
      await this.graph.post(`/${phoneNumberId}/register`, {
        accessToken,
        json: { messaging_product: 'whatsapp', pin: REGISTER_PIN },
      });
      return { success: true };
    } catch (err) {
      return {
        success: false,
        message: err instanceof MetaApiError ? err.message : String(err),
      };
    }
  }

  async fetchPhoneNumberInfo(
    phoneNumberId: string,
    accessToken: string,
  ): Promise<{ displayPhoneNumber?: string; verifiedName?: string }> {
    try {
      const data = await this.graph.get<{
        display_phone_number?: string;
        verified_name?: string;
      }>(`/${phoneNumberId}`, {
        accessToken,
        params: { fields: 'display_phone_number,verified_name' },
      });
      return {
        displayPhoneNumber: data.display_phone_number,
        verifiedName: data.verified_name,
      };
    } catch {
      return {};
    }
  }

  /** Traduce errores de Meta a BadRequestException con mensaje legible para el frontend. */
  private async request<T>(
    fallbackMessage: string,
    call: () => Promise<T>,
  ): Promise<T> {
    try {
      return await call();
    } catch (err) {
      throw new BadRequestException(
        err instanceof MetaApiError ? err.message : fallbackMessage,
      );
    }
  }
}
