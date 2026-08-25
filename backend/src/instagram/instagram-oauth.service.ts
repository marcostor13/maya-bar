import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { MetaGraphClient, MetaApiError } from '../shared/meta-graph.client';

export interface IgOAuthState {
  tenantId: string;
}

export interface IgShortLivedToken {
  accessToken: string;
  userId: string;
}

export interface IgLongLivedToken {
  accessToken: string;
  expiresIn: number; // segundos
}

const AUTHORIZE_URL = 'https://www.instagram.com/oauth/authorize';
const IG_API_HOST = 'https://api.instagram.com';
const IG_GRAPH_HOST = 'https://graph.instagram.com';
const SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_messages',
];
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutos

@Injectable()
export class InstagramOAuthService {
  constructor(
    private config: ConfigService,
    private graph: MetaGraphClient,
  ) {}

  private appId(): string {
    const id = this.config.get<string>('INSTAGRAM_APP_ID');
    if (!id)
      throw new BadRequestException(
        'INSTAGRAM_APP_ID no configurado en el servidor',
      );
    return id;
  }

  private appSecret(): string {
    const secret = this.config.get<string>('INSTAGRAM_APP_SECRET');
    if (!secret)
      throw new BadRequestException(
        'INSTAGRAM_APP_SECRET no configurado en el servidor',
      );
    return secret;
  }

  private redirectUri(): string {
    const base = this.config.get<string>('PUBLIC_API_URL');
    if (!base)
      throw new BadRequestException(
        'PUBLIC_API_URL no configurado en el servidor',
      );
    return `${base.replace(/\/$/, '')}/instagram-accounts/oauth/callback`;
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

  verifyState(state: string): IgOAuthState | null {
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

  /** Canjea el `code` del callback por un access token de corta duración. */
  async exchangeCodeForToken(code: string): Promise<IgShortLivedToken> {
    const data = await this.request<{
      access_token?: string;
      user_id?: string;
    }>('No se pudo canjear el código de autorización', () =>
      this.graph.post('/oauth/access_token', {
        host: IG_API_HOST,
        unversioned: true,
        form: {
          client_id: this.appId(),
          client_secret: this.appSecret(),
          grant_type: 'authorization_code',
          redirect_uri: this.redirectUri(),
          code,
        },
      }),
    );
    if (!data.access_token || !data.user_id) {
      throw new BadRequestException(
        'No se pudo canjear el código de autorización',
      );
    }
    return { accessToken: data.access_token, userId: String(data.user_id) };
  }

  /** Canjea el token corto por uno de larga duración (~60 días). */
  async exchangeForLongLivedToken(
    shortLivedToken: string,
  ): Promise<IgLongLivedToken> {
    const data = await this.request<{
      access_token?: string;
      expires_in?: number;
    }>('No se pudo generar el token de larga duración', () =>
      this.graph.get('/access_token', {
        host: IG_GRAPH_HOST,
        unversioned: true,
        params: {
          grant_type: 'ig_exchange_token',
          client_secret: this.appSecret(),
          access_token: shortLivedToken,
        },
      }),
    );
    if (!data.access_token) {
      throw new BadRequestException(
        'No se pudo generar el token de larga duración',
      );
    }
    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in ?? 5184000,
    };
  }

  /** Renueva un token de larga duración vigente (debe tener > 24h de antigüedad). */
  async refreshLongLivedToken(currentToken: string): Promise<IgLongLivedToken> {
    const data = await this.request<{
      access_token?: string;
      expires_in?: number;
    }>('No se pudo renovar el token', () =>
      this.graph.get('/refresh_access_token', {
        host: IG_GRAPH_HOST,
        unversioned: true,
        params: {
          grant_type: 'ig_refresh_token',
          access_token: currentToken,
        },
      }),
    );
    if (!data.access_token) {
      throw new BadRequestException('No se pudo renovar el token');
    }
    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in ?? 5184000,
    };
  }

  /**
   * Obtiene el perfil vía /me. El `user_id` del token exchange es un ID app-scoped que
   * Graph no acepta en /{id} ni en messaging/webhooks; el `user_id` de /me es el ID real
   * de la cuenta profesional y es el que debe persistirse como igBusinessAccountId.
   */
  async fetchProfile(
    accessToken: string,
  ): Promise<{ userId?: string; username?: string }> {
    try {
      const data = await this.graph.get<{
        user_id?: string | number;
        username?: string;
      }>('/me', {
        host: IG_GRAPH_HOST,
        accessToken,
        params: { fields: 'user_id,username' },
      });
      return {
        userId: data.user_id != null ? String(data.user_id) : undefined,
        username: data.username,
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
