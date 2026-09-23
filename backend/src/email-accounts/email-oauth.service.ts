import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type OAuthProvider = 'gmail' | 'outlook';

/** Minutos que tiene el usuario para completar la autorización. */
const STATE_TTL_MS = 15 * 60_000;

interface ProviderSpec {
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientIdEnv: string;
  clientSecretEnv: string;
  extraParams: Record<string, string>;
}

/**
 * Gmail y Outlook se conectan con OAuth2 y se usan por IMAP/SMTP con
 * XOAUTH2: así el correo tiene un solo camino y no hace falta que el usuario
 * cree contraseñas de aplicación.
 *
 * - Gmail: scope `https://mail.google.com/` (IMAP y SMTP).
 * - Outlook / Microsoft 365: scopes de IMAP y SMTP de outlook.office.com.
 */
function specs(tenant: string): Record<OAuthProvider, ProviderSpec> {
  return {
    gmail: {
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: ['https://mail.google.com/', 'openid', 'email', 'profile'],
      clientIdEnv: 'GOOGLE_OAUTH_CLIENT_ID',
      clientSecretEnv: 'GOOGLE_OAUTH_CLIENT_SECRET',
      // offline + consent: sin ellos Google no devuelve refresh token.
      extraParams: { access_type: 'offline', prompt: 'consent' },
    },
    outlook: {
      authorizeUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
      tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      scopes: [
        'offline_access',
        'openid',
        'email',
        'profile',
        'https://outlook.office.com/IMAP.AccessAsUser.All',
        'https://outlook.office.com/SMTP.Send',
      ],
      clientIdEnv: 'MICROSOFT_OAUTH_CLIENT_ID',
      clientSecretEnv: 'MICROSOFT_OAUTH_CLIENT_SECRET',
      extraParams: { response_mode: 'query', prompt: 'select_account' },
    },
  };
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  email?: string;
  name?: string;
}

export interface OAuthState {
  tenantId: string;
  provider: OAuthProvider;
}

@Injectable()
export class EmailOAuthService {
  constructor(private config: ConfigService) {}

  private spec(provider: OAuthProvider): ProviderSpec {
    const tenant =
      this.config.get<string>('MICROSOFT_OAUTH_TENANT') || 'common';
    return specs(tenant)[provider];
  }

  /** Qué proveedores tienen credenciales de OAuth en el servidor. */
  available(): Record<OAuthProvider, boolean> {
    const has = (p: OAuthProvider) =>
      !!this.config.get<string>(this.spec(p).clientIdEnv) &&
      !!this.config.get<string>(this.spec(p).clientSecretEnv);
    return { gmail: has('gmail'), outlook: has('outlook') };
  }

  private credentials(provider: OAuthProvider) {
    const s = this.spec(provider);
    const clientId = this.config.get<string>(s.clientIdEnv);
    const clientSecret = this.config.get<string>(s.clientSecretEnv);
    if (!clientId || !clientSecret)
      throw new BadRequestException(
        `La conexión con ${provider === 'gmail' ? 'Gmail' : 'Outlook'} no está configurada en el servidor (${s.clientIdEnv}).`,
      );
    return { clientId, clientSecret };
  }

  redirectUri(provider: OAuthProvider): string {
    const base = this.config.get<string>('PUBLIC_API_URL');
    if (!base)
      throw new BadRequestException(
        'PUBLIC_API_URL no configurado en el servidor',
      );
    return `${base.replace(/\/$/, '')}/email-accounts/oauth/${provider}/callback`;
  }

  buildAuthorizeUrl(provider: OAuthProvider, tenantId: string): string {
    const s = this.spec(provider);
    const { clientId } = this.credentials(provider);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: this.redirectUri(provider),
      response_type: 'code',
      scope: s.scopes.join(' '),
      state: this.signState({ tenantId, provider }),
      ...s.extraParams,
    });
    return `${s.authorizeUrl}?${params.toString()}`;
  }

  async exchangeCode(
    provider: OAuthProvider,
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

  refresh(provider: OAuthProvider, refreshToken: string): Promise<OAuthTokens> {
    return this.tokenRequest(provider, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
  }

  private async tokenRequest(
    provider: OAuthProvider,
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

  signState(state: OAuthState): string {
    const json = Buffer.from(
      JSON.stringify({
        ...state,
        nonce: randomBytes(8).toString('hex'),
        exp: Date.now() + STATE_TTL_MS,
      }),
    );
    const sig = createHmac('sha256', this.secret()).update(json).digest();
    return `${json.toString('base64url')}.${sig.toString('base64url')}`;
  }

  verifyState(state: string, provider: OAuthProvider): OAuthState | null {
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
      const payload = JSON.parse(json.toString()) as OAuthState & {
        exp: number;
      };
      if (!payload.tenantId || payload.exp < Date.now()) return null;
      if (payload.provider !== provider) return null;
      return { tenantId: payload.tenantId, provider: payload.provider };
    } catch {
      return null;
    }
  }
}

/**
 * Lee los datos del id_token. No se verifica la firma: el token llega por TLS
 * directamente del proveedor en el canje del código, no del navegador.
 */
export function decodeJwtPayload(token?: string): {
  email?: string;
  preferred_username?: string;
  name?: string;
} {
  const part = token?.split('.')[1];
  if (!part) return {};
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString()) as {
      email?: string;
      preferred_username?: string;
      name?: string;
    };
  } catch {
    return {};
  }
}
