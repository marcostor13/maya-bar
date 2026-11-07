import { CalendarOAuthService } from './calendar-oauth.service';

const env: Record<string, string> = {
  GOOGLE_OAUTH_CLIENT_ID: 'gid',
  GOOGLE_OAUTH_CLIENT_SECRET: 'gsecret',
  MICROSOFT_OAUTH_CLIENT_ID: 'mid',
  MICROSOFT_OAUTH_CLIENT_SECRET: 'msecret',
  PUBLIC_API_URL: 'https://api.maya.test/',
  JWT_SECRET: 'jwt',
};
const config = {
  get: (k: string) => env[k],
  getOrThrow: (k: string) => env[k],
};

describe('CalendarOAuthService', () => {
  const svc = new CalendarOAuthService(config as never);
  const scopes = (url: string) =>
    new URL(url).searchParams.get('scope')!.split(' ');

  it('Google pide crear eventos y leer ocupado/libre, con refresh token', () => {
    const url = svc.buildAuthorizeUrl('google', 'tenant-1');
    expect(scopes(url)).toEqual(
      expect.arrayContaining([
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/calendar.freebusy',
      ]),
    );
    const q = new URL(url).searchParams;
    expect(q.get('access_type')).toBe('offline');
    expect(q.get('redirect_uri')).toBe(
      'https://api.maya.test/calendar/oauth/google/callback',
    );
  });

  it('Microsoft pide Calendars.ReadWrite (lee y crea) y offline_access', () => {
    const url = svc.buildAuthorizeUrl('microsoft', 'tenant-1');
    expect(scopes(url)).toEqual(
      expect.arrayContaining([
        'offline_access',
        'https://graph.microsoft.com/Calendars.ReadWrite',
      ]),
    );
  });

  it('el state firmado solo vale para su proveedor y tenant', () => {
    const state = new URL(
      svc.buildAuthorizeUrl('google', 'tenant-1', 'user-1'),
    ).searchParams.get('state')!;
    expect(svc.verifyState(state, 'google')).toEqual({
      tenantId: 'tenant-1',
      userId: 'user-1',
      provider: 'google',
    });
    expect(svc.verifyState(state, 'microsoft')).toBeNull();
    expect(svc.verifyState(`${state}x`, 'google')).toBeNull();
  });
});
