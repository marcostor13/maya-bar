import { ConfigService } from '@nestjs/config';
import { MercadoPagoClient } from './mercadopago.client';

function client(token = 'TEST') {
  return new MercadoPagoClient({
    get: (k: string) => (k === 'MP_ACCESS_TOKEN' ? token : undefined),
  } as unknown as ConfigService);
}

const res = (status: number, body: unknown) =>
  ({
    ok: status < 400,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  }) as Response;

describe('MercadoPagoClient (HU45 R2)', () => {
  const realFetch = global.fetch;
  let fetchMock: jest.Mock;
  beforeEach(() => {
    // Sin avance automático: los reintentos esperan y aquí se adelanta el reloj (no es intermitente).
    jest.useFakeTimers();
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });
  afterEach(() => {
    global.fetch = realFetch;
    jest.useRealTimers();
  });

  it('reintenta ante 5xx y devuelve la respuesta buena', async () => {
    fetchMock
      .mockResolvedValueOnce(res(502, {}))
      .mockResolvedValueOnce(res(200, { id: 1, status: 'approved' }));
    const done = expect(client().getPayment(1)).resolves.toMatchObject({
      status: 'approved',
    });
    await jest.runAllTimersAsync();
    await done;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('no reintenta un 4xx', async () => {
    fetchMock.mockResolvedValue(res(404, { message: 'not found' }));
    await expect(client().getPayment(1)).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reintenta fallos de red hasta 3 intentos y luego falla', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));
    const done = expect(client().getPayment(1)).rejects.toThrow('ECONNRESET');
    await jest.runAllTimersAsync();
    await done;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('manda la clave de idempotencia al crear y el token en la cabecera', async () => {
    fetchMock.mockResolvedValue(res(201, { id: 'pref', init_point: 'x' }));
    await client().createPreference({ items: [] }, 'checkout-abc');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer TEST',
      'X-Idempotency-Key': 'checkout-abc',
    });
  });

  it('sin token no llama a la API', async () => {
    await expect(client('').getPayment(1)).rejects.toThrow('MP_ACCESS_TOKEN');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
