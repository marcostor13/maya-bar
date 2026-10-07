import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { LinkTrackingService, VISITOR_COOKIE } from './link-tracking.service';
import { LinkClick, ShortDomain, ShortLink } from './link.schemas';

const exec = <T>(value: T) => ({
  exec: jest.fn().mockResolvedValue(value),
  lean: jest.fn().mockReturnThis(),
});

const CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

/** Deja terminar el registro del clic, que no se espera en `handle`. */
const flush = async () => {
  for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r));
};

describe('LinkTrackingService', () => {
  let service: LinkTrackingService;
  let links: Record<string, jest.Mock>;
  let clicks: Record<string, jest.Mock>;
  let domains: Record<string, jest.Mock>;

  const link = (over: Record<string, unknown> = {}) => ({
    _id: new Types.ObjectId(),
    tenantId: new Types.ObjectId(),
    destination: 'https://tienda.com/oferta',
    utm: { source: 'sms' },
    status: 'active',
    customerId: new Types.ObjectId(),
    ...over,
  });

  const req = (over: Record<string, unknown> = {}) =>
    ({
      method: 'GET',
      query: {},
      headers: { 'user-agent': CHROME, 'x-forwarded-for': '198.51.100.7' },
      socket: { remoteAddress: '10.0.0.1' },
      ...over,
    }) as never;

  const res = () => {
    const r: Record<string, jest.Mock> = {};
    for (const m of ['setHeader', 'status', 'type', 'send', 'redirect'])
      r[m] = jest.fn(() => r);
    return r;
  };

  beforeEach(async () => {
    links = {
      findOne: jest.fn(() => exec(null)),
      updateOne: jest.fn(() => exec({})),
    };
    clicks = {
      create: jest.fn().mockResolvedValue({}),
      exists: jest.fn().mockResolvedValue(null),
    };
    domains = { find: jest.fn(() => exec([{ domain: 'ir.empresa.com' }])) };
    const mod = await Test.createTestingModule({
      providers: [
        LinkTrackingService,
        { provide: getModelToken(ShortLink.name), useValue: links },
        { provide: getModelToken(LinkClick.name), useValue: clicks },
        { provide: getModelToken(ShortDomain.name), useValue: domains },
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    }).compile();
    service = mod.get(LinkTrackingService);
    await service.onModuleInit();
  });

  it('reconoce solo los dominios cortos registrados', async () => {
    expect(await service.isShortDomain('IR.empresa.com')).toBe(true);
    expect(await service.isShortDomain('api.mayacrm.site')).toBe(false);
  });

  it('un código que no existe da 404 y no registra nada', async () => {
    const r = res();
    await service.handle('', 'nada', req(), r as never);
    await flush();
    expect(r.status).toHaveBeenCalledWith(404);
    expect(r.redirect).not.toHaveBeenCalled();
    expect(clicks.create).not.toHaveBeenCalled();
  });

  it.each([
    ['pausado', { status: 'paused' }],
    ['caducado', { expiresAt: new Date(Date.now() - 1000) }],
  ])('un link %s responde 410 y no redirige', async (_label, over) => {
    links.findOne.mockReturnValue(exec(link(over)));
    const r = res();
    await service.handle('', 'abc', req(), r as never);
    expect(r.status).toHaveBeenCalledWith(410);
    expect(r.redirect).not.toHaveBeenCalled();
  });

  it('redirige con 302 sin caché, pone la cookie de visitante y guarda el clic', async () => {
    const l = link();
    links.findOne.mockReturnValue(exec(l));
    const r = res();

    await service.handle(
      '',
      'abc',
      req({
        query: { cupon: 'A1' },
        headers: {
          'user-agent': CHROME,
          'x-forwarded-for': '1.1.1.1, 198.51.100.7',
          'accept-language': 'es-PE,es;q=0.9',
          referer: 'https://l.instagram.com/?u=x',
          cookie: '_ga=GA1.2; otra=1',
        },
      }),
      r as never,
    );
    await flush();

    expect(links.findOne.mock.calls[0][0]).toEqual({ domain: '', code: 'abc' });
    const [status, target] = r.redirect.mock.calls[0];
    expect(status).toBe(302);
    expect(target).toBe('https://tienda.com/oferta?utm_source=sms&cupon=A1');
    expect(r.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'no-store, max-age=0',
    );
    const cookie = r.setHeader.mock.calls.find(
      (c) => c[0] === 'Set-Cookie',
    )![1];
    expect(cookie).toMatch(
      new RegExp(`^${VISITOR_COOKIE}=[a-f0-9]{24}; .*HttpOnly`),
    );

    const saved = clicks.create.mock.calls[0][0];
    expect(saved).toMatchObject({
      tenantId: l.tenantId,
      linkId: l._id,
      customerId: l.customerId,
      // El último valor de la cadena: el primero lo escribe el cliente.
      ip: '198.51.100.7',
      browser: 'Chrome',
      os: 'Android',
      device: 'mobile',
      isBot: false,
      isUnique: true,
      language: 'es-PE',
      refererHost: 'l.instagram.com',
      query: { cupon: 'A1' },
      cookies: { _ga: 'GA1.2', otra: '1' },
    });
    expect(links.updateOne.mock.calls[0][1].$inc).toEqual({
      clicks: 1,
      uniqueClicks: 1,
    });
  });

  it('un visitante que vuelve conserva su cookie y no cuenta como único', async () => {
    links.findOne.mockReturnValue(exec(link()));
    clicks.exists.mockResolvedValue({ _id: 1 });
    const visitor = 'a'.repeat(24);
    const r = res();

    await service.handle(
      '',
      'abc',
      req({
        headers: {
          'user-agent': CHROME,
          cookie: `${VISITOR_COOKIE}=${visitor}`,
        },
      }),
      r as never,
    );
    await flush();

    expect(r.setHeader.mock.calls.some((c) => c[0] === 'Set-Cookie')).toBe(
      false,
    );
    const saved = clicks.create.mock.calls[0][0];
    expect(saved.visitorId).toBe(visitor);
    expect(saved.isUnique).toBe(false);
    // La cookie propia no se guarda entre las del visitante.
    expect(saved.cookies).toBeUndefined();
  });

  it.each([
    [
      'un previsualizador',
      { headers: { 'user-agent': 'WhatsApp/2.23.20.0 A' } },
    ],
    ['una petición HEAD', { method: 'HEAD' }],
  ])('%s se guarda como bot y no suma clics humanos', async (_label, over) => {
    links.findOne.mockReturnValue(exec(link()));
    const r = res();
    await service.handle('', 'abc', req(over), r as never);
    await flush();
    // El bot también recibe la redirección: necesita el destino para la tarjeta.
    expect(r.redirect).toHaveBeenCalled();
    expect(clicks.create.mock.calls[0][0]).toMatchObject({
      isBot: true,
      isUnique: false,
    });
    expect(links.updateOne.mock.calls[0][1]).toEqual({
      $inc: { botClicks: 1 },
    });
  });

  it('si guardar el clic falla, la redirección ya salió igual', async () => {
    links.findOne.mockReturnValue(exec(link()));
    clicks.create.mockRejectedValue(new Error('mongo caído'));
    const r = res();
    await expect(
      service.handle('', 'abc', req(), r as never),
    ).resolves.toBeUndefined();
    await flush();
    expect(r.redirect).toHaveBeenCalledTimes(1);
  });

  it('un bucle desde la misma IP sigue redirigiendo pero deja de registrarse', async () => {
    links.findOne.mockReturnValue(exec(link({ _id: new Types.ObjectId() })));
    const l = link();
    links.findOne.mockReturnValue(exec(l));
    const r = res();
    for (let i = 0; i < 30; i++)
      await service.handle('', 'abc', req(), r as never);
    await flush();
    expect(r.redirect).toHaveBeenCalledTimes(30);
    expect(clicks.create).toHaveBeenCalledTimes(20);
  });
});
