import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { ConversionsService } from './conversions.service';

const tenantId = new Types.ObjectId().toString();
const customerId = new Types.ObjectId().toString();
const URL = 'https://ignia.site/api/conversions';

const referral = {
  ctwaClid: 'ARAbc123',
  adId: '120210000000000',
  sourceUrl: 'https://fb.me/anuncio',
};

function buildQuery(result: unknown) {
  return { exec: jest.fn().mockResolvedValue(result) };
}

/** Documento tal como lo devuelve `create`, con su `save()`. */
function makeDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    tenantId: new Types.ObjectId(tenantId),
    event: 'lead',
    refType: 'lead',
    refId: 'lead-1',
    ctwaClid: referral.ctwaClid,
    adId: referral.adId,
    value: 0,
    currency: 'PEN',
    occurredAt: new Date('2026-09-22T10:00:00.000Z'),
    status: 'pending',
    attempts: 0,
    nextAttemptAt: new Date(),
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as any;
}

function mockResponse(ok: boolean) {
  return {
    ok,
    text: jest.fn().mockResolvedValue(ok ? 'ok' : 'service unavailable'),
  } as unknown as Response;
}

describe('ConversionsService', () => {
  let service: ConversionsService;
  let model: any;
  let convModel: any;
  let customerModel: any;
  let fetchSpy: jest.SpyInstance;

  function build(url = URL) {
    const config = {
      get: (key: string) =>
        key === 'CONVERSIONS_URL'
          ? url
          : key === 'CONVERSIONS_TOKEN'
            ? 'tok'
            : '',
    } as unknown as ConfigService;
    return new ConversionsService(model, convModel, customerModel, config);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    model = {
      create: jest.fn().mockImplementation((data: any) => makeDoc(data)),
      find: jest.fn().mockReturnValue({
        sort: () => ({ limit: () => buildQuery([]) }),
      }),
      findOneAndUpdate: jest.fn().mockReturnValue(buildQuery(null)),
    };
    convModel = { findOne: jest.fn().mockReturnValue(buildQuery(null)) };
    customerModel = { findOne: jest.fn().mockReturnValue(buildQuery(null)) };
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(mockResponse(true));
    service = build();
  });

  afterEach(() => fetchSpy.mockRestore());

  // ─── atribución ───────────────────────────────────────────────────────────

  it('does not report anything when the customer did not come from an ad', async () => {
    customerModel.findOne.mockReturnValue(
      buildQuery({ name: 'Ana', phone: '+51 991 172 822' }),
    );

    const result = await service.report({
      tenantId,
      event: 'purchase',
      refType: 'lead',
      refId: 'lead-1',
      customerId,
      value: 1200,
    });

    expect(result).toBeNull();
    expect(model.create).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('takes the attribution from the customer and posts it with the token', async () => {
    customerModel.findOne.mockReturnValue(
      buildQuery({
        name: 'Ana',
        phone: '+51 991 172 822',
        email: 'ana@t.c',
        adReferral: referral,
      }),
    );

    await service.report({
      tenantId,
      event: 'purchase',
      refType: 'lead',
      refId: 'lead-1',
      customerId,
      value: 1200,
      currency: 'PEN',
    });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe(URL);
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer tok',
    });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      event: 'purchase',
      ctwa_clid: referral.ctwaClid,
      ad_id: referral.adId,
      value: 1200,
      currency: 'PEN',
      contact: { name: 'Ana', phone: '+51 991 172 822', email: 'ana@t.c' },
      reference: { type: 'lead', id: 'lead-1' },
    });
  });

  it('falls back to the WhatsApp chat of that phone number when the contact has no attribution', async () => {
    convModel.findOne.mockReturnValue(buildQuery({ adReferral: referral }));

    await service.report({
      tenantId,
      event: 'schedule',
      refType: 'reservation',
      refId: 'res-1',
      phone: '991172822',
      name: 'Ana',
    });

    // El chat se busca por el número normalizado, que es como lo guarda WhatsApp.
    expect(convModel.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'whatsapp', contact: '51991172822' }),
    );
    expect(model.create).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  // ─── entrega ──────────────────────────────────────────────────────────────

  it('marks the event as sent once the endpoint accepts it', async () => {
    customerModel.findOne.mockReturnValue(buildQuery({ adReferral: referral }));

    const doc = await service.report({
      tenantId,
      event: 'lead',
      refType: 'lead',
      refId: 'lead-1',
      customerId,
    });

    expect(doc?.status).toBe('sent');
    expect(doc?.sentAt).toBeInstanceOf(Date);
  });

  it('keeps the event pending with a later retry when the endpoint fails', async () => {
    fetchSpy.mockResolvedValue(mockResponse(false));
    customerModel.findOne.mockReturnValue(buildQuery({ adReferral: referral }));

    const doc = await service.report({
      tenantId,
      event: 'lead',
      refType: 'lead',
      refId: 'lead-1',
      customerId,
    });

    expect(doc?.status).toBe('pending');
    expect(doc?.attempts).toBe(1);
    expect(doc?.lastError).toContain('HTTP');
    expect(doc!.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('records the event without calling out when there is no endpoint configured', async () => {
    service = build('');
    customerModel.findOne.mockReturnValue(buildQuery({ adReferral: referral }));

    const doc = await service.report({
      tenantId,
      event: 'lead',
      refType: 'lead',
      refId: 'lead-1',
      customerId,
    });

    expect(doc?.status).toBe('pending');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not report the same business fact twice', async () => {
    customerModel.findOne.mockReturnValue(buildQuery({ adReferral: referral }));
    model.create.mockRejectedValue({ code: 11000 });

    const doc = await service.report({
      tenantId,
      event: 'lead',
      refType: 'lead',
      refId: 'lead-1',
      customerId,
    });

    expect(doc).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // ─── embudo ───────────────────────────────────────────────────────────────

  it('maps the funnel stages that count as a conversion', async () => {
    customerModel.findOne.mockReturnValue(buildQuery({ adReferral: referral }));
    const lead = {
      _id: new Types.ObjectId(),
      tenantId,
      customerId,
      stage: 'qualified',
      value: 800,
      currency: 'PEN',
      title: 'Aula virtual',
    };

    await service.reportLeadStage(lead, 'contacted');
    expect(model.create.mock.calls[0][0]).toMatchObject({ event: 'lead' });

    await service.reportLeadStage({ ...lead, stage: 'won' }, 'negotiation');
    expect(model.create.mock.calls[1][0]).toMatchObject({ event: 'purchase' });
  });

  it('ignores the stages that are not a conversion', async () => {
    const lead = {
      _id: new Types.ObjectId(),
      tenantId,
      customerId,
      stage: 'proposal',
    };

    expect(await service.reportLeadStage(lead, 'contacted')).toBeNull();
    expect(model.create).not.toHaveBeenCalled();
  });
});
