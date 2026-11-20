import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';

jest.mock('node:dns/promises', () => ({
  resolve4: jest.fn(),
  resolveTxt: jest.fn(),
}));
import { resolve4, resolveTxt } from 'node:dns/promises';
import { LandingDomainsService } from './landing-domains.service';
import type { ProxyDomainsService } from './proxy-domains.service';

const resolve4Mock = resolve4 as unknown as jest.Mock;
const resolveTxtMock = resolveTxt as unknown as jest.Mock;

describe('LandingDomainsService.verify (HU25)', () => {
  const tenantId = new Types.ObjectId().toString();
  let doc: Record<string, unknown> & { save: jest.Mock };
  let proxy: {
    frontendEnabled: boolean;
    ensure: jest.Mock;
    remove: jest.Mock;
    frontendAppUuid: jest.Mock;
  };
  let service: LandingDomainsService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    doc = {
      _id: new Types.ObjectId(),
      domain: 'fiesta.miempresa.com',
      status: 'pending',
      verifyToken: 'tok123',
      resolvedTo: [],
      save: jest.fn().mockResolvedValue(undefined),
    };
    const model = {
      findOne: jest.fn(() => ({ exec: () => Promise.resolve(doc) })),
      deleteOne: jest.fn(() => ({ exec: () => Promise.resolve({}) })),
    };
    proxy = {
      frontendEnabled: true,
      ensure: jest.fn().mockResolvedValue('added'),
      remove: jest.fn().mockResolvedValue(undefined),
      frontendAppUuid: jest.fn().mockResolvedValue('front-uuid'),
    };
    const config = {
      get: (k: string) =>
        ({
          SERVER_IP: '52.1.145.159',
          FRONTEND_URL: 'https://mayacrm.site',
          PUBLIC_API_URL: 'https://api.mayacrm.site',
        })[k],
    } as unknown as ConfigService;
    service = new LandingDomainsService(
      model as never,
      {} as never,
      {} as never,
      proxy as unknown as ProxyDomainsService,
      config,
    );
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    resolveTxtMock.mockResolvedValue([['maya-verify=', 'tok123']]);
  });

  afterEach(() => jest.restoreAllMocks());

  it('C2: sin DNS queda pendiente y explica el CNAME y el registro A', async () => {
    resolve4Mock.mockRejectedValue(new Error('ENOTFOUND'));
    const v = await service.verify(String(doc._id), tenantId);
    expect(v.status).toBe('pending');
    expect(v.checkMessage).toContain('CNAME hacia mayacrm.site');
    expect(v.checkMessage).toContain('52.1.145.159');
    expect(proxy.ensure).not.toHaveBeenCalled();
  });

  it('C2: apuntando a otra IP queda pendiente y avisa de la nube gris', async () => {
    resolve4Mock.mockResolvedValue(['104.21.1.1']);
    const v = await service.verify(String(doc._id), tenantId);
    expect(v.status).toBe('pending');
    expect(v.checkMessage).toContain('nube gris');
  });

  it('C2: DNS bien sin respuesta → alta en la app del frontend y activando', async () => {
    resolve4Mock.mockResolvedValue(['52.1.145.159']);
    fetchMock.mockRejectedValue(new Error('no cert'));
    const v = await service.verify(String(doc._id), tenantId);
    expect(proxy.ensure).toHaveBeenCalledWith(
      'fiesta.miempresa.com',
      'front-uuid',
    );
    expect(v.status).toBe('activating');

    // Una segunda verificación al momento no vuelve a pedir el alta.
    await service.verify(String(doc._id), tenantId);
    expect(proxy.ensure).toHaveBeenCalledTimes(1);
  });

  it('C2: con el DNS bien pero sin el TXT del token queda pendiente y no toca Coolify', async () => {
    resolve4Mock.mockResolvedValue(['52.1.145.159']);
    resolveTxtMock.mockResolvedValue([['maya-verify=de-otra-empresa']]);
    const v = await service.verify(String(doc._id), tenantId);
    expect(resolveTxtMock).toHaveBeenCalledWith(
      '_maya-verify.fiesta.miempresa.com',
    );
    expect(v.status).toBe('pending');
    expect(v.checkMessage).toContain('maya-verify=tok123');
    expect(v.txtName).toBe('_maya-verify.fiesta.miempresa.com');
    expect(v.txtValue).toBe('maya-verify=tok123');
    expect(proxy.ensure).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('C2: si responde /healthz queda activo', async () => {
    resolve4Mock.mockResolvedValue(['52.1.145.159']);
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' }),
    });
    const v = await service.verify(String(doc._id), tenantId);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://fiesta.miempresa.com/healthz',
      expect.anything(),
    );
    expect(v.status).toBe('active');
    expect(proxy.ensure).not.toHaveBeenCalled();
  });

  it('C2: sin Coolify queda dns_ok con el alta manual explicada', async () => {
    proxy.frontendEnabled = false;
    resolve4Mock.mockResolvedValue(['52.1.145.159']);
    fetchMock.mockRejectedValue(new Error('x'));
    const v = await service.verify(String(doc._id), tenantId);
    expect(v.status).toBe('dns_ok');
    expect(v.checkMessage).toContain('Coolify');
  });

  it('C2: si Coolify falla queda dns_ok', async () => {
    resolve4Mock.mockResolvedValue(['52.1.145.159']);
    fetchMock.mockRejectedValue(new Error('x'));
    proxy.ensure.mockRejectedValue(new Error('500'));
    const v = await service.verify(String(doc._id), tenantId);
    expect(v.status).toBe('dns_ok');
    // Tras el fallo tampoco se reintenta el alta antes de 10 minutos.
    await service.verify(String(doc._id), tenantId);
    expect(proxy.ensure).toHaveBeenCalledTimes(1);
  });

  it('C6: quitar saca el dominio de la app del frontend; si Coolify falla, se borra igual', async () => {
    proxy.remove.mockRejectedValue(new Error('500'));
    await expect(
      service.remove(String(doc._id), tenantId),
    ).resolves.toBeUndefined();
    expect(proxy.remove).toHaveBeenCalledWith(
      'fiesta.miempresa.com',
      'front-uuid',
    );
  });
});
