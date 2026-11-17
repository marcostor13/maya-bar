import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import {
  ApiAccessService,
  QuotaExceededException,
  domainAllowed,
  hashKey,
  hostOf,
  normalizeDomain,
} from './api-access.service';
import type { ApiAccess } from './api-access.schema';

const TENANT = new Types.ObjectId().toString();
const OTHER = new Types.ObjectId().toString();
const USER = new Types.ObjectId().toString();
const WA_ID = new Types.ObjectId().toString();

function harness() {
  const saved: any[] = [];
  const docs: any[] = [];
  const model: any = {
    create: jest.fn((doc: any) => {
      const d = {
        _id: new Types.ObjectId(),
        sentCount: 0,
        ...doc,
        save: jest.fn(function (this: any) {
          saved.push(this);
          return Promise.resolve(this);
        }),
      };
      docs.push(d);
      return Promise.resolve(d);
    }),
    find: jest.fn(() => ({
      sort: () => ({ exec: () => Promise.resolve(docs) }),
    })),
    findOne: jest.fn((filter: any) => ({
      exec: () =>
        Promise.resolve(
          docs.find((d) => {
            if (filter.keyHash)
              return d.keyHash === filter.keyHash && !d.revokedAt;
            return (
              String(d._id) === String(filter._id) &&
              String(d.tenantId) === String(filter.tenantId)
            );
          }) ?? null,
        ),
    })),
    updateOne: jest.fn(() => ({ exec: () => Promise.resolve({}) })),
  };
  const counters = new Map<string, number>();
  const usage: any = {
    findOneAndUpdate: jest.fn((filter: any) => ({
      exec: () => {
        const k = `${String(filter.accessId)}|${filter.bucket}`;
        counters.set(k, (counters.get(k) ?? 0) + 1);
        return Promise.resolve({ count: counters.get(k) });
      },
    })),
  };
  const account = {
    _id: new Types.ObjectId(WA_ID),
    tenantId: new Types.ObjectId(TENANT),
    label: 'Ventas',
    phoneNumber: '+51 999 000 111',
    active: true,
  };
  const wa: any = {
    findAll: jest.fn(() => Promise.resolve([account])),
    findOne: jest.fn((id: string, tenantId: string) =>
      id === WA_ID && tenantId === TENANT
        ? Promise.resolve(account)
        : Promise.reject(
            new NotFoundException('Cuenta de WhatsApp no encontrada'),
          ),
    ),
    findById: jest.fn((id: string) =>
      Promise.resolve(id === WA_ID ? account : null),
    ),
  };
  const ig: any = {
    findAll: jest.fn(() =>
      Promise.resolve([
        {
          _id: new Types.ObjectId(),
          tenantId: account.tenantId,
          label: 'IG',
          username: 'marca',
          active: false,
        },
      ]),
    ),
  };
  const ms: any = { findAll: jest.fn(() => Promise.resolve([])) };
  const service = new ApiAccessService(model, usage, wa, ig, ms);
  return { service, model, usage, docs, account, wa };
}

const createDto = {
  name: 'Web',
  channel: 'whatsapp' as const,
  accountId: WA_ID,
  allowedDomains: ['https://www.MiTienda.pe/contacto'],
};

describe('ApiAccessService', () => {
  describe('crear (C1, C2)', () => {
    it('C1: devuelve la clave una vez y guarda solo su hash y prefijo', async () => {
      const { service, docs } = harness();
      const { access, key } = await service.create(TENANT, USER, createDto);

      expect(key).toMatch(/^mk_[A-Za-z0-9_-]{43}$/);
      expect(docs[0].keyHash).toBe(hashKey(key));
      expect(docs[0].keyPrefix).toBe(key.slice(0, 10));
      expect(JSON.stringify(docs[0])).not.toContain(key);
      expect(access).not.toHaveProperty('keyHash');
      expect(access.allowedDomains).toEqual(['www.mitienda.pe']);
      expect(access.accountLabel).toBe('Ventas');
      expect(access.perMinuteLimit).toBe(60);
      expect(access.perDayLimit).toBe(2000);
    });

    it('C2: una cuenta de otra empresa no se puede compartir', async () => {
      const { service } = harness();
      await expect(service.create(OTHER, USER, createDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('C2: sin dominios o con un dominio inválido → 400', async () => {
      const { service } = harness();
      await expect(
        service.create(TENANT, USER, { ...createDto, allowedDomains: [] }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create(TENANT, USER, {
          ...createDto,
          allowedDomains: ['no es dominio'],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('una IP inválida → 400; ::ffff:1.2.3.4 se guarda como 1.2.3.4', async () => {
      const { service } = harness();
      await expect(
        service.create(TENANT, USER, { ...createDto, allowedIps: ['1.2.3'] }),
      ).rejects.toThrow(BadRequestException);
      const { access } = await service.create(TENANT, USER, {
        ...createDto,
        allowedIps: ['::ffff:1.2.3.4'],
      });
      expect(access.allowedIps).toEqual(['1.2.3.4']);
    });
  });

  describe('autenticar, revocar y regenerar (C4, C13)', () => {
    it('la clave válida autentica; una inventada o sin prefijo no', async () => {
      const { service } = harness();
      const { key } = await service.create(TENANT, USER, createDto);
      expect(await service.authenticate(key)).not.toBeNull();
      expect(await service.authenticate('mk_otra')).toBeNull();
      expect(await service.authenticate(key.slice(3))).toBeNull();
      expect(await service.authenticate(undefined)).toBeNull();
    });

    it('C4: una clave revocada deja de autenticar en el acto', async () => {
      const { service } = harness();
      const { access, key } = await service.create(TENANT, USER, createDto);
      const revoked = await service.revoke(TENANT, access._id);
      expect(revoked.revoked).toBe(true);
      expect(await service.authenticate(key)).toBeNull();
    });

    it('C13: regenerar invalida la clave anterior y la nueva funciona', async () => {
      const { service } = harness();
      const { access, key } = await service.create(TENANT, USER, createDto);
      const { key: nueva } = await service.regenerate(TENANT, access._id);
      expect(nueva).not.toBe(key);
      expect(await service.authenticate(key)).toBeNull();
      expect(await service.authenticate(nueva)).not.toBeNull();
    });

    it('no se regenera un acceso revocado ni se toca uno de otra empresa', async () => {
      const { service } = harness();
      const { access } = await service.create(TENANT, USER, createDto);
      await expect(service.regenerate(OTHER, access._id)).rejects.toThrow(
        NotFoundException,
      );
      await service.revoke(TENANT, access._id);
      await expect(service.regenerate(TENANT, access._id)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('origen e IP (C4)', () => {
    const access = {
      allowedDomains: ['mitienda.pe', '*.empresa.com'],
      allowedIps: [],
    } as unknown as ApiAccess;

    it('acepta el dominio, su www. y los subdominios del comodín', () => {
      const { service } = harness();
      for (const origin of [
        'https://mitienda.pe',
        'https://www.mitienda.pe',
        'https://app.empresa.com',
        'https://empresa.com',
      ])
        expect(service.originProblem(access, { origin })).toBeNull();
    });

    it('usa el Referer si no hay Origin', () => {
      const { service } = harness();
      expect(
        service.originProblem(access, {
          referer: 'https://mitienda.pe/contacto?x=1',
        }),
      ).toBeNull();
    });

    it('rechaza sin cabecera, con dominio ajeno o parecido', () => {
      const { service } = harness();
      expect(service.originProblem(access, {})).toMatch(/Falta la cabecera/);
      for (const origin of [
        'https://otra.pe',
        'https://mitienda.pe.evil.com',
        'https://evilmitienda.pe',
        'https://shop.mitienda.pe',
        'no-es-url',
      ])
        expect(service.originProblem(access, { origin })).not.toBeNull();
    });

    it('con lista de IPs, exige que la IP esté en ella', () => {
      const { service } = harness();
      const withIps = {
        ...access,
        allowedIps: ['10.0.0.5'],
      } as unknown as ApiAccess;
      const origin = 'https://mitienda.pe';
      expect(
        service.originProblem(withIps, { origin, ip: '::ffff:10.0.0.5' }),
      ).toBeNull();
      expect(
        service.originProblem(withIps, { origin, ip: '10.0.0.6' }),
      ).toMatch(/IP/);
    });

    it('helpers: normalizeDomain, hostOf, domainAllowed', () => {
      expect(normalizeDomain(' HTTPS://Shop.Mi-Tienda.pe:8443/x ')).toBe(
        'shop.mi-tienda.pe',
      );
      expect(normalizeDomain('*.empresa.com')).toBe('*.empresa.com');
      expect(normalizeDomain('localhost')).toBe('localhost');
      expect(normalizeDomain('a b')).toBeUndefined();
      expect(hostOf('https://A.com/x')).toBe('a.com');
      expect(hostOf(undefined)).toBeUndefined();
      expect(domainAllowed('a.com', ['a.com'])).toBe(true);
    });
  });

  describe('límites (C9)', () => {
    it('C9: con 2 por minuto, la tercera petición del minuto → 429 con espera', async () => {
      const { service } = harness();
      const access = {
        _id: new Types.ObjectId(),
        perMinuteLimit: 2,
        perDayLimit: 100,
      } as unknown as ApiAccess;
      const now = Date.UTC(2026, 10, 14, 12, 0, 30);
      await service.consumeQuota(access, now);
      await service.consumeQuota(access, now);
      const err = await service.consumeQuota(access, now).catch((e) => e);
      expect(err).toBeInstanceOf(QuotaExceededException);
      expect(err.getStatus()).toBe(429);
      expect(err.retryAfter).toBe(30);
      // El minuto siguiente vuelve a dejar pasar.
      await expect(
        service.consumeQuota(access, now + 60_000),
      ).resolves.toBeUndefined();
    });

    it('el límite diario también corta', async () => {
      const { service } = harness();
      const access = {
        _id: new Types.ObjectId(),
        perMinuteLimit: 100,
        perDayLimit: 1,
      } as unknown as ApiAccess;
      const now = Date.UTC(2026, 10, 14, 23, 0, 0);
      await service.consumeQuota(access, now);
      const err = await service.consumeQuota(access, now).catch((e) => e);
      expect(err).toBeInstanceOf(QuotaExceededException);
      expect(err.retryAfter).toBe(3600);
    });
  });

  describe('cuenta viva (C5)', () => {
    it('C5: cuenta borrada, de otra empresa o inactiva → 409', async () => {
      const { service, account } = harness();
      const base = {
        channel: 'whatsapp',
        accountId: new Types.ObjectId(WA_ID),
        tenantId: new Types.ObjectId(TENANT),
      };
      await expect(
        service.liveAccount(base as unknown as ApiAccess),
      ).resolves.toBe(account);
      await expect(
        service.liveAccount({
          ...base,
          accountId: new Types.ObjectId(),
        } as unknown as ApiAccess),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.liveAccount({
          ...base,
          tenantId: new Types.ObjectId(OTHER),
        } as unknown as ApiAccess),
      ).rejects.toThrow(ConflictException);
      account.active = false;
      await expect(
        service.liveAccount(base as unknown as ApiAccess),
      ).rejects.toThrow(/inactiva/);
    });
  });

  it('lista las cuentas compartibles de los tres canales', async () => {
    const { service } = harness();
    const list = await service.accounts(TENANT);
    expect(list).toEqual([
      expect.objectContaining({
        channel: 'whatsapp',
        id: WA_ID,
        label: 'Ventas',
        detail: '+51 999 000 111',
        active: true,
      }),
      expect.objectContaining({
        channel: 'instagram',
        detail: '@marca',
        active: false,
      }),
    ]);
  });
});
