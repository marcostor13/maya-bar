import { EmailOAuthService, decodeJwtPayload } from './email-oauth.service';

const env: Record<string, string> = {
  JWT_SECRET: 'jwt-secreto',
  PUBLIC_API_URL: 'https://api.maya.pe/',
  GOOGLE_OAUTH_CLIENT_ID: 'g-id',
  GOOGLE_OAUTH_CLIENT_SECRET: 'g-secret',
};
const config = {
  get: (k: string) => env[k],
  getOrThrow: (k: string) => {
    if (!env[k]) throw new Error(k);
    return env[k];
  },
};
const jwt = (payload: object) =>
  `x.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.y`;

describe('EmailOAuthService', () => {
  const service = new EmailOAuthService(config as never);
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('informa qué proveedores están configurados', () => {
    expect(service.available()).toEqual({ gmail: true, outlook: false });
  });

  it('arma la URL de Google con acceso offline, IMAP/SMTP y estado firmado', () => {
    const url = new URL(service.buildAuthorizeUrl('gmail', 'tenant-1'));
    expect(url.origin + url.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://api.maya.pe/email-accounts/oauth/gmail/callback',
    );
    expect(url.searchParams.get('scope')).toContain('https://mail.google.com/');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    const state = url.searchParams.get('state')!;
    expect(service.verifyState(state, 'gmail')).toEqual({
      tenantId: 'tenant-1',
      provider: 'gmail',
    });
  });

  it('explica qué falta si Outlook no está configurado', () => {
    expect(() => service.buildAuthorizeUrl('outlook', 't')).toThrow(
      'MICROSOFT_OAUTH_CLIENT_ID',
    );
  });

  it('rechaza estados manipulados, de otro proveedor o caducados', () => {
    const state = service.signState({ tenantId: 't1', provider: 'gmail' });
    const [p, s] = state.split('.');
    const forged = Buffer.from(
      JSON.stringify({
        tenantId: 'otro',
        provider: 'gmail',
        exp: Date.now() + 1e6,
      }),
    ).toString('base64url');
    expect(service.verifyState(`${forged}.${s}`, 'gmail')).toBeNull();
    expect(service.verifyState(state, 'outlook')).toBeNull();
    expect(service.verifyState(`${p}`, 'gmail')).toBeNull();

    jest.useFakeTimers().setSystemTime(Date.now() + 16 * 60_000);
    expect(service.verifyState(state, 'gmail')).toBeNull();
    jest.useRealTimers();
  });

  it('canjea el código y lee el correo del id_token', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'at',
          refresh_token: 'rt',
          expires_in: 3599,
          id_token: jwt({ email: 'Ana@Acme.PE', name: 'Ana' }),
        }),
        { status: 200 },
      ),
    );
    global.fetch = fetchMock as never;
    const tokens = await service.exchangeCode('gmail', 'code-1');
    expect(tokens).toMatchObject({
      accessToken: 'at',
      refreshToken: 'rt',
      email: 'ana@acme.pe',
      name: 'Ana',
    });
    expect(tokens.expiresAt.getTime()).toBeGreaterThan(Date.now() + 3500_000);
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    const body = new URLSearchParams(init.body);
    expect(Object.fromEntries(body)).toMatchObject({
      grant_type: 'authorization_code',
      code: 'code-1',
      client_id: 'g-id',
      client_secret: 'g-secret',
    });
  });

  it('exige refresh token al conectar y propaga el error del proveedor', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'at' })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: 'invalid_grant',
            error_description: 'Token has been expired or revoked.',
          }),
          { status: 400 },
        ),
      ) as never;
    await expect(service.exchangeCode('gmail', 'c')).rejects.toThrow(
      'refresh token',
    );
    await expect(service.refresh('gmail', 'rt')).rejects.toThrow(
      'OAuth gmail: Token has been expired or revoked.',
    );
  });

  it('decodeJwtPayload tolera tokens vacíos o rotos', () => {
    expect(decodeJwtPayload(undefined)).toEqual({});
    expect(decodeJwtPayload('a.!!!.c')).toEqual({});
    expect(decodeJwtPayload(jwt({ preferred_username: 'x@y.com' }))).toEqual({
      preferred_username: 'x@y.com',
    });
  });
});
