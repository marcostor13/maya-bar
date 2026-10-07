import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { LinksService } from './links.service';
import { LinkTrackingService } from './link-tracking.service';
import { ProxyDomainsService } from './proxy-domains.service';
import { LinkBatch, LinkClick, ShortDomain, ShortLink } from './link.schemas';
import { Customer } from '../customers/customer.schema';
import { Tenant } from '../tenants/tenant.schema';
import { ListsService } from '../lists/lists.service';
import * as dns from 'node:dns/promises';

jest.mock('node:dns/promises', () => ({ resolve4: jest.fn() }));
const resolve4 = dns.resolve4 as unknown as jest.Mock;

const query = <T>(value: T) => {
  const q: Record<string, jest.Mock> = {};
  for (const m of ['sort', 'limit', 'lean', 'populate'])
    q[m] = jest.fn(() => q);
  q.exec = jest.fn().mockResolvedValue(value);
  return q;
};

const model = (): Record<string, any> => ({
  find: jest.fn(() => query([])),
  findOne: jest.fn(() => query(null)),
  findById: jest.fn(() => query(null)),
  exists: jest.fn().mockResolvedValue(null),
  create: jest.fn(),
  insertMany: jest.fn().mockResolvedValue([]),
  deleteMany: jest.fn(() => query({})),
  deleteOne: jest.fn(() => query({})),
  updateMany: jest.fn(() => query({})),
  countDocuments: jest.fn().mockResolvedValue(0),
  aggregate: jest.fn(() => query([])),
});

describe('LinksService', () => {
  const tenantId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();
  let service: LinksService;
  let links: ReturnType<typeof model>;
  let clicks: ReturnType<typeof model>;
  let domains: ReturnType<typeof model>;
  let batches: ReturnType<typeof model>;
  let customers: ReturnType<typeof model>;
  const lists = { resolveCustomers: jest.fn() };
  const tracking = { refreshDomains: jest.fn() };
  const proxy = { enabled: true, ensure: jest.fn(), remove: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    links = model();
    clicks = model();
    domains = model();
    batches = model();
    customers = model();
    const env: Record<string, string> = {
      PUBLIC_API_URL: 'https://api.test/',
      FRONTEND_URL: 'https://app.test',
      SERVER_IP: '203.0.113.9',
    };
    const mod = await Test.createTestingModule({
      providers: [
        LinksService,
        { provide: getModelToken(ShortLink.name), useValue: links },
        { provide: getModelToken(LinkClick.name), useValue: clicks },
        { provide: getModelToken(ShortDomain.name), useValue: domains },
        { provide: getModelToken(LinkBatch.name), useValue: batches },
        { provide: getModelToken(Customer.name), useValue: customers },
        { provide: getModelToken(Tenant.name), useValue: model() },
        { provide: ListsService, useValue: lists },
        { provide: LinkTrackingService, useValue: tracking },
        { provide: ProxyDomainsService, useValue: proxy },
        { provide: ConfigService, useValue: { get: (k: string) => env[k] } },
      ],
    }).compile();
    service = mod.get(LinksService);
  });

  it('arma la URL corta con dominio propio o con el de la plataforma', () => {
    expect(service.shortUrl({ domain: '', code: 'abc1234' })).toBe(
      'https://api.test/l/abc1234',
    );
    expect(
      service.shortUrl({ domain: 'ir.empresa.com', code: 'abc1234' }),
    ).toBe('https://ir.empresa.com/abc1234');
  });

  it('busca un link siempre dentro de la empresa', async () => {
    await expect(
      service.findOne(new Types.ObjectId().toString(), tenantId),
    ).rejects.toThrow(NotFoundException);
    expect(links.findOne.mock.calls[0][0].tenantId.toString()).toBe(tenantId);
  });

  it('create normaliza el destino y guarda el alias pedido', async () => {
    links.create.mockImplementation((doc: Record<string, unknown>) => ({
      ...doc,
      toObject: () => doc,
    }));

    const link = await service.create(tenantId, userId, {
      destination: 'tienda.com/oferta',
      alias: 'promo',
      utm: { source: ' sms ', medium: '' },
    });

    const saved = links.create.mock.calls[0][0];
    expect(saved.destination).toBe('https://tienda.com/oferta');
    expect(saved.code).toBe('promo');
    expect(saved.utm).toEqual({ source: 'sms' });
    expect(saved.tenantId.toString()).toBe(tenantId);
    expect(link.shortUrl).toBe('https://api.test/l/promo');
  });

  it('un alias repetido da conflicto, y uno reservado ni se intenta', async () => {
    links.create.mockRejectedValue({ code: 11000 });
    await expect(
      service.create(tenantId, userId, {
        destination: 'https://x.com',
        alias: 'promo',
      }),
    ).rejects.toThrow(ConflictException);

    links.create.mockClear();
    await expect(
      service.create(tenantId, userId, {
        destination: 'https://x.com',
        alias: 'api',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(links.create).not.toHaveBeenCalled();
  });

  describe('dominios', () => {
    it('no deja usar un dominio que no es de la empresa o no está activo', async () => {
      await expect(
        service.resolveDomain(tenantId, 'ajeno.com'),
      ).rejects.toThrow(/no está registrado/);
      expect(domains.findOne.mock.calls[0][0].tenantId.toString()).toBe(
        tenantId,
      );

      domains.findOne.mockReturnValue(
        query({ domain: 'ir.empresa.com', status: 'dns_ok' }),
      );
      await expect(
        service.resolveDomain(tenantId, 'ir.empresa.com'),
      ).rejects.toThrow(/no está activo/);
    });

    it('sin dominio pedido usa el predeterminado activo, o el de la plataforma', async () => {
      expect(await service.resolveDomain(tenantId)).toBe('');
      domains.findOne.mockReturnValue(query({ domain: 'ir.empresa.com' }));
      expect(await service.resolveDomain(tenantId)).toBe('ir.empresa.com');
      expect(domains.findOne.mock.calls.at(-1)![0]).toMatchObject({
        isDefault: true,
        status: 'active',
      });
    });

    it('rechaza registrar los dominios de la propia plataforma', async () => {
      for (const d of ['api.test', 'x.api.test', 'app.test', 'www.app.test'])
        await expect(service.addDomain(tenantId, userId, d)).rejects.toThrow(
          /plataforma/,
        );
      expect(domains.create).not.toHaveBeenCalled();
    });

    it('un dominio ya registrado por otra empresa da conflicto', async () => {
      domains.findOne.mockReturnValue(
        query({ tenantId: new Types.ObjectId(), domain: 'ir.otra.com' }),
      );
      await expect(
        service.addDomain(tenantId, userId, 'ir.otra.com'),
      ).rejects.toThrow(/otra cuenta/);
    });

    describe('verificación y alta automática', () => {
      const doc = (over: Record<string, unknown> = {}) => {
        const d: Record<string, unknown> = {
          _id: new Types.ObjectId(),
          tenantId: new Types.ObjectId(tenantId),
          domain: 'ir.empresa.com',
          status: 'pending',
          save: jest.fn().mockResolvedValue(undefined),
          ...over,
        };
        d.toObject = () => d;
        return d;
      };
      const ping = (ok: boolean) =>
        (global.fetch = jest.fn().mockResolvedValue({
          ok,
          text: () => Promise.resolve(ok ? 'maya-links-ok' : ''),
        }) as never);

      beforeEach(() => {
        proxy.enabled = true;
        proxy.ensure.mockResolvedValue('added');
      });

      it('si el DNS no apunta al servidor, no se pide nada al proxy', async () => {
        resolve4.mockResolvedValue(['198.51.100.1']);
        const d = doc();
        domains.findOne.mockReturnValue(query(d));

        const out = await service.verifyDomain(String(d._id), tenantId);

        expect(out.status).toBe('pending');
        expect(out.checkMessage).toContain('203.0.113.9');
        expect(proxy.ensure).not.toHaveBeenCalled();
      });

      it('con el DNS correcto pide el alta al proxy y queda activándose', async () => {
        resolve4.mockResolvedValue(['203.0.113.9']);
        ping(false);
        const d = doc();
        domains.findOne.mockReturnValue(query(d));

        const out = await service.verifyDomain(String(d._id), tenantId);

        expect(proxy.ensure).toHaveBeenCalledWith('ir.empresa.com');
        expect(out.status).toBe('activating');
        expect(out.activationRequestedAt).toBeInstanceOf(Date);
      });

      it('mientras se activa no vuelve a pedir el alta en cada verificación', async () => {
        resolve4.mockResolvedValue(['203.0.113.9']);
        ping(false);
        const d = doc({
          status: 'activating',
          activationRequestedAt: new Date(),
        });
        domains.findOne.mockReturnValue(query(d));

        await service.verifyDomain(String(d._id), tenantId);
        expect(proxy.ensure).not.toHaveBeenCalled();

        // Pasado el plazo sin cuajar, se reintenta.
        d.activationRequestedAt = new Date(Date.now() - 16 * 60 * 1000);
        await service.verifyDomain(String(d._id), tenantId);
        expect(proxy.ensure).toHaveBeenCalledTimes(1);
      });

      it('cuando el dominio ya responde por https pasa a activo', async () => {
        resolve4.mockResolvedValue(['203.0.113.9']);
        ping(true);
        const d = doc({ status: 'activating' });
        domains.findOne.mockReturnValue(query(d));

        const out = await service.verifyDomain(String(d._id), tenantId);
        expect(out.status).toBe('active');
        expect(proxy.ensure).not.toHaveBeenCalled();
      });

      it('si el proxy falla o no está configurado, queda en DNS correcto con su aviso', async () => {
        resolve4.mockResolvedValue(['203.0.113.9']);
        ping(false);
        proxy.ensure.mockRejectedValue(new Error('422'));
        let d = doc();
        domains.findOne.mockReturnValue(query(d));
        let out = await service.verifyDomain(String(d._id), tenantId);
        expect(out.status).toBe('dns_ok');
        expect(out.checkMessage).toContain('automáticamente');

        proxy.enabled = false;
        d = doc();
        domains.findOne.mockReturnValue(query(d));
        out = await service.verifyDomain(String(d._id), tenantId);
        expect(out.status).toBe('dns_ok');
        expect(out.checkMessage).toContain('SHORT_LINK_DOMAINS');
      });
    });

    it('no se elimina un dominio que todavía usan links', async () => {
      const id = new Types.ObjectId();
      domains.findOne.mockReturnValue(
        query({
          _id: id,
          tenantId: new Types.ObjectId(tenantId),
          domain: 'ir.empresa.com',
        }),
      );
      links.countDocuments.mockResolvedValue(3);
      await expect(
        service.removeDomain(id.toString(), tenantId),
      ).rejects.toThrow(/3 link/);
      expect(domains.deleteOne).not.toHaveBeenCalled();
    });
  });

  describe('lotes', () => {
    it('sin destinatarios no crea nada', async () => {
      await expect(
        service.createBatch(tenantId, userId, {
          name: 'Vacío',
          destination: 'https://x.com',
          channel: 'sms',
          rows: [{ name: '  ' }],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(batches.create).not.toHaveBeenCalled();
    });

    it('desde un archivo: un link por fila distinta, todos del lote y de la empresa', async () => {
      const batchId = new Types.ObjectId();
      batches.create.mockResolvedValue({ _id: batchId, name: 'Promo' });

      await service.createBatch(tenantId, userId, {
        name: 'Promo',
        destination: 'https://x.com',
        channel: 'sms',
        rows: [
          { name: 'Ana', phone: '999', fields: { Ciudad: 'Lima' } },
          { name: 'Ana', phone: '999' },
          { name: 'Luis', email: 'LUIS@X.COM' },
        ],
      });

      const docs = links.insertMany.mock.calls[0][0];
      expect(docs).toHaveLength(2);
      expect(new Set(docs.map((d: { code: string }) => d.code)).size).toBe(2);
      for (const d of docs) {
        expect(d.tenantId.toString()).toBe(tenantId);
        expect(d.batchId).toBe(batchId);
        expect(d.code).toMatch(/^[0-9A-Za-z]{7}$/);
      }
      expect(docs[0].recipient).toMatchObject({
        name: 'Ana',
        fields: { Ciudad: 'Lima' },
      });
      expect(docs[1].recipient.email).toBe('luis@x.com');
      expect(batches.create.mock.calls[0][0]).toMatchObject({
        source: 'file',
        count: 2,
      });
    });

    it('desde contactos: solo entran los de la empresa', async () => {
      const mine = new Types.ObjectId();
      customers.find.mockReturnValue(query([{ _id: mine }]));
      batches.create.mockResolvedValue({
        _id: new Types.ObjectId(),
        name: 'x',
      });

      await service.createBatch(tenantId, userId, {
        name: 'x',
        destination: 'https://x.com',
        channel: 'email',
        customerIds: [mine.toString(), new Types.ObjectId().toString()],
      });

      expect(customers.find.mock.calls[0][0].tenantId.toString()).toBe(
        tenantId,
      );
      expect(links.insertMany.mock.calls[0][0]).toHaveLength(1);
    });

    it('si fallan los links, el lote no queda a medias', async () => {
      const batchId = new Types.ObjectId();
      batches.create.mockResolvedValue({ _id: batchId, name: 'x' });
      links.insertMany.mockRejectedValue(new Error('mongo caído'));

      await expect(
        service.createBatch(tenantId, userId, {
          name: 'x',
          destination: 'https://x.com',
          channel: 'sms',
          rows: [{ name: 'Ana' }],
        }),
      ).rejects.toThrow('mongo caído');
      expect(batches.deleteOne).toHaveBeenCalledWith({ _id: batchId });
    });
  });

  describe('analítica', () => {
    it('siempre filtra por empresa y rechaza ids inválidos', async () => {
      await expect(
        service.stats(tenantId, { linkId: 'no-es-un-id' }),
      ).rejects.toThrow(BadRequestException);

      const linkId = new Types.ObjectId().toString();
      const stats = await service.stats(tenantId, { linkId });
      const calls = clicks.aggregate.mock.calls as unknown as [
        { $match: Record<string, { toString(): string }> }[],
      ][];
      const match = calls[0][0][0].$match;
      expect(match.tenantId.toString()).toBe(tenantId);
      expect(match.linkId.toString()).toBe(linkId);
      // Sin clics devuelve ceros y una serie continua, no huecos.
      expect(stats.totals).toEqual({
        clicks: 0,
        unique: 0,
        bots: 0,
        lastClickAt: null,
      });
      expect(stats.hours).toHaveLength(7);
      expect(stats.series.length).toBeGreaterThan(28);
    });
  });
});
