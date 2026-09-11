import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { MetaGraphClient, MetaApiError } from '../shared/meta-graph.client';

export interface MsOAuthState {
  tenantId: string;
}

export interface MsLongLivedToken {
  accessToken: string;
  expiresIn: number; // segundos (0 = sin vencimiento)
}

/** Página de Facebook autorizada, con su propio Page Access Token. */
export interface MsPage {
  id: string;
  name?: string;
  username?: string;
  accessToken: string;
}

const AUTHORIZE_URL = 'https://www.facebook.com/v21.0/dialog/oauth';
const SCOPES = [
  'pages_show_list',
  'pages_messaging',
  'pages_manage_metadata',
  'pages_read_engagement',
];
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutos

/**
 * Facebook Login para conectar Páginas: el dueño autoriza una vez y de ahí
 * salen los Page Access Tokens con los que se envían y reciben los DMs.
 */
@Injectable()
export class MessengerOAuthService {
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

  private redirectUri(): string {
    const base = this.config.get<string>('PUBLIC_API_URL');
    if (!base)
      throw new BadRequestException(
        'PUBLIC_API_URL no configurado en el servidor',
      );
    return `${base.replace(/\/$/, '')}/messenger-accounts/oauth/callback`;
  }

  private stateSecret(): string {
    return this.config.getOrThrow<string>('JWT_SECRET');
  }

  /** Firma un estado opaco (HMAC) que amarra el callback al tenant que inició el flujo. */
  signState(tenantId: string): string {
    const payload = JSON.stringify({
      tenantId,
      nonce: randomBytes(8).toString('hex'),
      exp: Date.now() + STATE_TTL_MS,
    });
    const json = Buffer.from(payload);
    const sig = createHmac('sha256', this.stateSecret()).update(json).digest();
    return `${json.toString('base64url')}.${sig.toString('base64url')}`;
  }

  verifyState(state: string): MsOAuthState | null {
    const [p, s] = (state || '').split('.');
    if (!p || !s) return null;
    try {
      const json = Buffer.from(p, 'base64url');
      const expected = createHmac('sha256', this.stateSecret())
        .update(json)
        .digest();
      const sig = Buffer.from(s, 'base64url');
      if (sig.length !== expected.length || !timingSafeEqual(sig, expected))
        return null;
      const payload = JSON.parse(json.toString()) as {
        tenantId: string;
        exp: number;
      };
      if (!payload.tenantId || payload.exp < Date.now()) return null;
      return { tenantId: payload.tenantId };
    } catch {
      return null;
    }
  }

  buildAuthorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.appId(),
      redirect_uri: this.redirectUri(),
      response_type: 'code',
      scope: SCOPES.join(','),
      state,
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  /** Canjea el `code` del callback por un access token de usuario de corta duración. */
  async exchangeCodeForToken(code: string): Promise<{ accessToken: string }> {
    const data = await this.request<{ access_token?: string }>(
      'No se pudo canjear el código de autorización',
      () =>
        this.graph.get('/oauth/access_token', {
          params: {
            client_id: this.appId(),
            client_secret: this.appSecret(),
            redirect_uri: this.redirectUri(),
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

  /**
   * Extiende el token de usuario a uno de larga duración (~60 días). Los Page
   * Access Tokens que se derivan de él no caducan mientras el permiso siga dado.
   */
  async exchangeForLongLivedToken(
    shortLivedToken: string,
  ): Promise<MsLongLivedToken> {
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

  /** Páginas que el usuario autorizó, cada una con su Page Access Token. */
  async listPages(userAccessToken: string): Promise<MsPage[]> {
    const data = await this.request<{
      data?: {
        id?: string;
        name?: string;
        username?: string;
        access_token?: string;
      }[];
    }>('No se pudieron leer las páginas de Facebook', () =>
      this.graph.get('/me/accounts', {
        accessToken: userAccessToken,
        params: { fields: 'id,name,username,access_token', limit: '100' },
      }),
    );
    return (data.data ?? [])
      .filter((p) => p.id && p.access_token)
      .map((p) => ({
        id: String(p.id),
        name: p.name,
        username: p.username,
        accessToken: String(p.access_token),
      }));
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
