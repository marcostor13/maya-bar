import { createHash } from 'crypto';
import { Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { MetaCapiService } from './meta-capi.service';

const sha = (v: string) => createHash('sha256').update(v).digest('hex');

const lean = <T>(v: T) => ({ lean: () => Promise.resolve(v) });
const selectLean = <T>(v: T) => ({ select: () => lean(v) });

function setup(
  env: Record<string, string> = {
    META_PIXEL_ID: '123',
    META_CAPI_TOKEN: 'tok',
  },
) {
  const created: Record<string, unknown>[] = [];
  const existing = new Set<string>();
  const events = {
    create: jest.fn((doc: Record<string, unknown>) => {
      if (existing.has(doc.eventId as string))
        return Promise.reject(Object.assign(new Error('dup'), { code: 11000 }));
      existing.add(doc.eventId as string);
      const d = { _id: new Types.ObjectId(), attempts: 0, ...doc };
      created.push(d);
      return Promise.resolve(d);
    }),
    updateOne: jest.fn().mockResolvedValue({}),
    find: jest.fn(() =>
      selectLean([...existing].map((eventId) => ({ eventId }))),
    ),
  };
  const tenantsById: Record<string, unknown> = {};
  const tenants = {
    findById: jest.fn((id: unknown) => lean(tenantsById[String(id)] ?? null)),
  };
  let pays: unknown[] = [];
  const payments = { find: jest.fn(() => selectLean(pays)) };
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  const svc = new MetaCapiService(
    events as never,
    tenants as never,
    payments as never,
    config,
  );
  return {
    svc,
    events,
    created,
    existing,
    tenantsById,
    setPays: (p: unknown[]) => (pays = p),
  };
}

const TID = new Types.ObjectId();
const tenant = (consent: boolean) => ({
  _id: TID,
  email: ' Dueno@Empresa.PE ',
  phone: '987 654 321',
  acquisition: {
    consent,
    fbc: 'fb.1.1700000000000.abc',
    fbp: 'fb.1.1700000000000.999',
    ip: '200.1.2.3',
    userAgent: 'UA',
    capturedAt: new Date(),
  },
});

describe('MetaCapiService (HU84)', () => {
  let fetchMock: jest.Mock;
  beforeEach(() => {
    fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, text: () => Promise.resolve('') });
    global.fetch = fetchMock as never;
  });

  it('user_data: correo y teléfono con SHA-256 normalizados; fbc, fbp, IP y navegador sin hash', () => {
    const { svc } = setup();
    const u = svc.userData(tenant(true));
    expect(u.em).toEqual([sha('dueno@empresa.pe')]);
    expect(u.ph).toEqual([sha('51987654321')]);
    expect(u.external_id).toEqual([sha(String(TID))]);
    expect(u).toMatchObject({
      fbc: 'fb.1.1700000000000.abc',
      fbp: 'fb.1.1700000000000.999',
      client_ip_address: '200.1.2.3',
      client_user_agent: 'UA',
    });
  });

  it('registro con consentimiento: un CompleteRegistration con event_id reg_<empresa>, una sola vez', async () => {
    const { svc, tenantsById, created } = setup();
    tenantsById[String(TID)] = tenant(true);
    await svc.reportRegistration(String(TID));
    await svc.reportRegistration(String(TID));
    expect(created).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // El cron no lo retoma mientras el primer envío está en curso.
    expect((created[0].nextAttemptAt as Date).getTime()).toBeGreaterThan(
      Date.now(),
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe('https://graph.facebook.com/v23.0/123/events');
    const body = JSON.parse(init.body);
    expect(body.access_token).toBe('tok');
    expect(body.data[0]).toMatchObject({
      event_name: 'CompleteRegistration',
      event_id: `reg_${String(TID)}`,
      action_source: 'website',
    });
  });

  it('sin consentimiento o sin configuración no se envía nada', async () => {
    const a = setup();
    a.tenantsById[String(TID)] = tenant(false);
    expect(await a.svc.reportRegistration(String(TID))).toBeNull();
    const b = setup({});
    b.tenantsById[String(TID)] = tenant(true);
    expect(await b.svc.reportRegistration(String(TID))).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('si Meta falla queda pendiente con su próximo intento', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('boom'),
    });
    const { svc, tenantsById, events } = setup();
    tenantsById[String(TID)] = tenant(true);
    await svc.reportRegistration(String(TID));
    const set = (
      events.updateOne.mock.calls[0] as [
        unknown,
        { $set: Record<string, unknown> },
      ]
    )[1].$set;
    expect(set).toMatchObject({ attempts: 1, status: 'pending' });
    expect(set.nextAttemptAt).toBeInstanceOf(Date);
  });

  it('pagos aprobados: un Purchase con valor y moneda reales; no se repite ni se manda sin consentimiento', async () => {
    const { svc, tenantsById, setPays, created } = setup();
    const other = new Types.ObjectId();
    tenantsById[String(TID)] = tenant(true);
    tenantsById[String(other)] = { ...tenant(false), _id: other };
    const p1 = {
      _id: new Types.ObjectId(),
      tenantId: TID,
      amount: 93.22,
      currency: 'PEN',
      paidAt: new Date(),
      concept: 'Plan Crece',
    };
    const p2 = {
      _id: new Types.ObjectId(),
      tenantId: other,
      amount: 50,
      currency: 'USD',
      paidAt: new Date(),
      concept: 'Plan Inicia',
    };
    setPays([p1, p2]);
    expect(await svc.sweepPayments()).toBe(1);
    expect(created[0]).toMatchObject({
      eventId: `pay_${String(p1._id)}`,
      eventName: 'Purchase',
    });
    expect(
      (created[0].payload as { custom_data: unknown }).custom_data,
    ).toMatchObject({ value: 93.22, currency: 'PEN' });
    expect(await svc.sweepPayments()).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
