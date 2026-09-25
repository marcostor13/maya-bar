import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  decodeJwtPayload,
  type OAuthTokens,
} from '../email-accounts/email-oauth.service';
import type { CalendarProvider } from './calendar-connection.schema';

/** Minutos que tiene el usuario para completar la autorización. */
const STATE_TTL_MS = 15 * 60_000;
/** Distingue este flujo del de correo: un `state` no sirve para el otro. */
const PURPOSE = 'calendar';

interface ProviderSpec {
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientIdEnv: string;
  clientSecretEnv: string;
  extraParams: Record<string, string>;
}

/**
 * Mismas apps de OAuth que el correo (mismas credenciales), pero con scopes
 * de calendario y un callback propio.
 */
function specs(tenant: string): Record<CalendarProvider, ProviderSpec> {
  return {
    google: {
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: [
        'https://www.googleapis.com/auth/calendar.events',
        'openid',
        'email',
        'profile',
      ],
      clientIdEnv: 'GOOGLE_OAUTH_CLIENT_ID',
      clientSecretEnv: 'GOOGLE_OAUTH_CLIENT_SECRET',
      // offline + consent: sin ellos Google no devuelve refresh token.
      extraParams: { access_type: 'offline', prompt: 'consent' },
    },
    microsoft: {
      authorizeUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
      tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      scopes: [
        'offline_access',
        'openid',
        'email',
        'profile',
        'https://graph.microsoft.com/Calendars.ReadWrite',
        'https://graph.microsoft.com/User.Read',
      ],
      clientIdEnv: 'MICROSOFT_OAUTH_CLIENT_ID',
      clientSecretEnv: 'MICROSOFT_OAUTH_CLIENT_SECRET',
      extraParams: { response_mode: 'query', prompt: 'select_account' },
    },
  };
}

export const PROVIDER_LABEL: Record<CalendarProvider, string> = {
  google: 'Google Calendar',
  microsoft: 'Microsoft 365',
};

export interface CalendarOAuthState {
  tenantId: string;
  userId?: string;
  provider: CalendarProvider;
}

@Injectable()
export class CalendarOAuthService {
  constructor(private config: ConfigService) {}

  private spec(provider: CalendarProvider): ProviderSpec {
    const tenant =
      this.config.get<string>('MICROSOFT_OAUTH_TENANT') || 'common';
    return specs(tenant)[provider];
  }

  /** Qué proveedores tienen credenciales de OAuth en el servidor. */
  available(): Record<CalendarProvider, boolean> {
    const has = (p: CalendarProvider) =>
      !!this.config.get<string>(this.spec(p).clientIdEnv) &&
      !!this.config.get<string>(this.spec(p).clientSecretEnv);
    return { google: has('google'), microsoft: has('microsoft') };
  }

  private credentials(provider: CalendarProvider) {
    const s = this.spec(provider);
    const clientId = this.config.get<string>(s.clientIdEnv);
    const clientSecret = this.config.get<string>(s.clientSecretEnv);
    if (!clientId || !clientSecret)
      throw new BadRequestException(
        `La conexión con ${PROVIDER_LABEL[provider]} no está configurada en el servidor (${s.clientIdEnv}).`,
      );
    return { clientId, clientSecret };
  }

  redirectUri(provider: CalendarProvider): string {
    const base = this.config.get<string>('PUBLIC_API_URL');
    if (!base)
      throw new BadRequestException(
        'PUBLIC_API_URL no configurado en el servidor',
      );
    return `${base.replace(/\/$/, '')}/calendar/oauth/${provider}/callback`;
  }

  buildAuthorizeUrl(
    provider: CalendarProvider,
    tenantId: string,
    userId?: string,
  ): string {
    const s = this.spec(provider);
    const { clientId } = this.credentials(provider);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: this.redirectUri(provider),
      response_type: 'code',
      scope: s.scopes.join(' '),
      state: this.signState({ tenantId, userId, provider }),
      ...s.extraParams,
    });
    return `${s.authorizeUrl}?${params.toString()}`;
  }

  async exchangeCode(
    provider: CalendarProvider,
    code: string,
  ): Promise<OAuthTokens> {
    const tokens = await this.tokenRequest(provider, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri(provider),
    });
    if (!tokens.refreshToken)
      throw new Error(
        'El proveedor no devolvió un refresh token; vuelve a autorizar',
      );
    return tokens;
  }

  refresh(
    provider: CalendarProvider,
    refreshToken: string,
  ): Promise<OAuthTokens> {
    return this.tokenRequest(provider, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      // Microsoft pide los scopes también al renovar; Google no los admite.
      ...(provider === 'microsoft'
        ? { scope: this.spec(provider).scopes.join(' ') }
        : {}),
    });
  }

  private async tokenRequest(
    provider: CalendarProvider,
    body: Record<string, string>,
  ): Promise<OAuthTokens> {
    const { clientId, clientSecret } = this.credentials(provider);
    const res = await fetch(this.spec(provider).tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        ...body,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });
    const data = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      id_token?: string;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !data.access_token)
      throw new Error(
        `OAuth ${provider}: ${data.error_description || data.error || res.status}`,
      );
    const claims = decodeJwtPayload(data.id_token);
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
      email: (claims.email || claims.preferred_username)?.toLowerCase(),
      name: claims.name,
    };
  }

  // ── Estado firmado: amarra el callback al tenant que inició el flujo ────

  private secret(): string {
    return this.config.getOrThrow<string>('JWT_SECRET');
  }

  signState(state: CalendarOAuthState): string {
    const json = Buffer.from(
      JSON.stringify({
        ...state,
        purpose: PURPOSE,
        nonce: randomBytes(8).toString('hex'),
        exp: Date.now() + STATE_TTL_MS,
      }),
    );
    const sig = createHmac('sha256', this.secret()).update(json).digest();
    return `${json.toString('base64url')}.${sig.toString('base64url')}`;
  }

  verifyState(
    state: string,
    provider: CalendarProvider,
  ): CalendarOAuthState | null {
    const [p, s] = (state || '').split('.');
    if (!p || !s) return null;
    try {
      const json = Buffer.from(p, 'base64url');
      const expected = createHmac('sha256', this.secret())
        .update(json)
        .digest();
      const sig = Buffer.from(s, 'base64url');
      if (sig.length !== expected.length || !timingSafeEqual(sig, expected))
        return null;
      const payload = JSON.parse(json.toString()) as CalendarOAuthState & {
        exp: number;
        purpose?: string;
      };
      if (payload.purpose !== PURPOSE) return null;
      if (!payload.tenantId || payload.exp < Date.now()) return null;
      if (payload.provider !== provider) return null;
      return {
        tenantId: payload.tenantId,
        userId: payload.userId,
        provider: payload.provider,
      };
    } catch {
      return null;
    }
  }
}
