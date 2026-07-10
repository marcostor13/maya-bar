import { MetaGraphClient, MetaApiError } from './meta-graph.client';

describe('MetaGraphClient', () => {
  let client: MetaGraphClient;
  let fetchSpy: jest.SpyInstance;

  const mockResponse = (body: unknown, ok = true, status = 200) =>
    ({
      ok,
      status,
      json: () => Promise.resolve(body),
    }) as unknown as Response;

  beforeEach(() => {
    client = new MetaGraphClient();
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => jest.restoreAllMocks());

  it('GET arma la URL versionada con host por defecto y query params', async () => {
    fetchSpy.mockResolvedValue(mockResponse({ id: '1' }));
    await client.get('/123', { params: { fields: 'name' } });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://graph.facebook.com/v21.0/123?fields=name',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('respeta host alternativo y unversioned', async () => {
    fetchSpy.mockResolvedValue(mockResponse({}));
    await client.get('/access_token', {
      host: 'https://graph.instagram.com',
      unversioned: true,
      params: { grant_type: 'ig_refresh_token' },
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://graph.instagram.com/access_token?grant_type=ig_refresh_token',
      expect.anything(),
    );
  });

  it('manda el access token como Bearer header', async () => {
    fetchSpy.mockResolvedValue(mockResponse({}));
    await client.get('/me', { accessToken: 'tok123' });
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer tok123',
    );
  });

  it('POST json serializa el body y setea Content-Type', async () => {
    fetchSpy.mockResolvedValue(mockResponse({}));
    await client.post('/1/messages', { json: { a: 1 } });
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
  });

  it('POST form manda URLSearchParams', async () => {
    fetchSpy.mockResolvedValue(mockResponse({}));
    await client.post('/oauth/access_token', {
      unversioned: true,
      form: { code: 'abc' },
    });
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBeInstanceOf(URLSearchParams);
    expect((init.body as URLSearchParams).get('code')).toBe('abc');
  });

  it('lanza MetaApiError con error.message de Graph', async () => {
    fetchSpy.mockResolvedValue(
      mockResponse({ error: { message: 'Unsupported get request' } }, false, 400),
    );
    await expect(client.get('/bad')).rejects.toThrow(MetaApiError);
    await expect(client.get('/bad')).rejects.toThrow('Unsupported get request');
  });

  it('lanza MetaApiError con error_message de los endpoints OAuth', async () => {
    fetchSpy.mockResolvedValue(
      mockResponse({ error_message: 'Invalid authorization code' }, false, 400),
    );
    await expect(
      client.post('/oauth/access_token', { unversioned: true }),
    ).rejects.toThrow('Invalid authorization code');
  });

  it('lanza MetaApiError aunque el status sea 200 si el body trae error', async () => {
    fetchSpy.mockResolvedValue(mockResponse({ error: { message: 'boom' } }));
    await expect(client.get('/x')).rejects.toThrow('boom');
  });

  it('tolera respuestas sin JSON válido', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('not json')),
    } as unknown as Response);
    await expect(client.get('/x')).rejects.toThrow(
      'Meta Graph API respondió 500',
    );
  });
});
