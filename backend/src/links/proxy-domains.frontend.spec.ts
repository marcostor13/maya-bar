import type { ConfigService } from '@nestjs/config';
import { ProxyDomainsService } from './proxy-domains.service';

const cfg = (vars: Record<string, string>) =>
  ({ get: (k: string) => vars[k] }) as unknown as ConfigService;

describe('ProxyDomainsService: app del frontend (HU25)', () => {
  let fetchMock: jest.Mock;
  const json = (body: unknown) =>
    Promise.resolve({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(body)),
    });

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  it('descubre la app del frontend por el dominio de FRONTEND_URL y la recuerda', async () => {
    const proxy = new ProxyDomainsService(
      cfg({
        COOLIFY_URL: 'https://coolify.x',
        COOLIFY_TOKEN: 't',
        COOLIFY_APP_UUID: 'api-uuid',
        FRONTEND_URL: 'https://mayacrm.site',
      }),
    );
    expect(proxy.frontendEnabled).toBe(true);
    fetchMock.mockReturnValue(
      json([
        { uuid: 'api-uuid', fqdn: 'https://api.mayacrm.site' },
        {
          uuid: 'front-uuid',
          fqdn: 'https://mayacrm.site,https://www.mayacrm.site',
        },
      ]),
    );
    await expect(proxy.frontendAppUuid()).resolves.toBe('front-uuid');
    await expect(proxy.frontendAppUuid()).resolves.toBe('front-uuid');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('con COOLIFY_FRONTEND_APP_UUID no consulta y el alta va a esa app', async () => {
    const proxy = new ProxyDomainsService(
      cfg({
        COOLIFY_URL: 'https://coolify.x',
        COOLIFY_TOKEN: 't',
        COOLIFY_FRONTEND_APP_UUID: 'front-uuid',
      }),
    );
    await expect(proxy.frontendAppUuid()).resolves.toBe('front-uuid');
    fetchMock
      .mockReturnValueOnce(json({ fqdn: 'https://mayacrm.site' }))
      .mockReturnValue(json({}));
    await expect(proxy.ensure('fiesta.com', 'front-uuid')).resolves.toBe(
      'added',
    );
    const calls = fetchMock.mock.calls.map((c) => `${c[1].method} ${c[0]}`);
    expect(calls).toEqual([
      'GET https://coolify.x/api/v1/applications/front-uuid',
      'PATCH https://coolify.x/api/v1/applications/front-uuid',
      'POST https://coolify.x/api/v1/deploy?uuid=front-uuid&force=false',
    ]);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      domains: 'https://mayacrm.site,https://fiesta.com',
    });
  });

  it('sin Coolify no está habilitado', () => {
    expect(
      new ProxyDomainsService(cfg({ FRONTEND_URL: 'https://mayacrm.site' }))
        .frontendEnabled,
    ).toBe(false);
  });
});
