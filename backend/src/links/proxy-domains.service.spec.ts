import { ConfigService } from '@nestjs/config';
import { ProxyDomainsService } from './proxy-domains.service';

describe('ProxyDomainsService', () => {
  let fetchMock: jest.Mock;
  let fqdn: string;

  const make = (env: Record<string, string>) =>
    new ProxyDomainsService({
      get: (k: string) => env[k],
    } as unknown as ConfigService);

  const ENV = {
    COOLIFY_URL: 'https://coolify.test/',
    COOLIFY_TOKEN: 'tok',
    COOLIFY_APP_UUID: 'app1',
  };

  beforeEach(() => {
    fqdn = 'https://api.test';
    fetchMock = jest.fn(
      (_url: string, init: { method: string; body?: string }) => {
        if (init.method === 'PATCH')
          fqdn = (JSON.parse(init.body!) as { domains: string }).domains;
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({ fqdn })),
        });
      },
    );
    global.fetch = fetchMock as never;
  });

  const calls = () =>
    (fetchMock.mock.calls as [string, { method: string }][]).map(
      ([url, init]) =>
        `${init.method} ${url.replace('https://coolify.test', '')}`,
    );

  it('sin las tres variables queda desactivado', () => {
    expect(make({}).enabled).toBe(false);
    expect(make({ ...ENV, COOLIFY_APP_UUID: '' }).enabled).toBe(false);
    expect(make(ENV).enabled).toBe(true);
  });

  it('añade el dominio conservando los que había y redespliega', async () => {
    const result = await make(ENV).ensure('ir.empresa.com');

    expect(result).toBe('added');
    expect(fqdn).toBe('https://api.test,https://ir.empresa.com');
    expect(calls()).toEqual([
      'GET /api/v1/applications/app1',
      'PATCH /api/v1/applications/app1',
      'POST /api/v1/deploy?uuid=app1&force=false',
    ]);
    const [, init] = fetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('si ya estaba no toca nada ni redespliega', async () => {
    fqdn = 'https://api.test,https://IR.empresa.com/';
    expect(await make(ENV).ensure('ir.empresa.com')).toBe('present');
    expect(calls()).toEqual(['GET /api/v1/applications/app1']);
  });

  it('dos altas a la vez no se pisan: van en serie', async () => {
    const service = make(ENV);
    await Promise.all([service.ensure('a.com'), service.ensure('b.com')]);
    expect(fqdn).toBe('https://api.test,https://a.com,https://b.com');
  });

  it('quitar un dominio no redespliega y nunca deja la app sin dominios', async () => {
    fqdn = 'https://api.test,https://ir.empresa.com';
    const service = make(ENV);
    await service.remove('ir.empresa.com');
    expect(fqdn).toBe('https://api.test');
    expect(calls().some((c) => c.startsWith('POST'))).toBe(false);

    fetchMock.mockClear();
    await service.remove('api.test');
    expect(fqdn).toBe('https://api.test');
    expect(calls()).toEqual(['GET /api/v1/applications/app1']);
  });

  it('un error del proxy se propaga con su respuesta y no bloquea la cola', async () => {
    const service = make(ENV);
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: () => Promise.resolve('domain conflict'),
    });
    await expect(service.ensure('x.com')).rejects.toThrow(
      'El proxy respondió 422: domain conflict',
    );
    await expect(service.ensure('y.com')).resolves.toBe('added');
  });
});
