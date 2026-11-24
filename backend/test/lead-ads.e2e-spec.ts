import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createHmac } from 'crypto';
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { MessengerAccount } from '../src/messenger-accounts/messenger-account.schema';
import { Customer } from '../src/customers/customer.schema';
import { Lead } from '../src/leads/lead.schema';
import { LeadAdLead } from '../src/lead-ads/lead-ads.schema';
import { LeadAdsService } from '../src/lead-ads/lead-ads.service';
import { MetaGraphClient } from '../src/shared/meta-graph.client';
import { PushService } from '../src/push/push.service';
import {
  bearer,
  createApp,
  createUser,
  registerTenant,
  type Session,
} from './support/app';

const SECRET = 'app-secret-e2e';
const PAGE = '1122334455';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Meta Lead Ads (HU60, e2e)', () => {
  let app: NestExpressApplication;
  let owner: Session;
  let customers: Model<Customer>;
  let leads: Model<Lead>;
  let log: Model<LeadAdLead>;
  let graphGet: jest.SpyInstance;
  let failGraph = false;
  const prevSecret = process.env.FACEBOOK_APP_SECRET;
  const http = () => request(app.getHttpServer());

  const answers: Record<string, { name: string; values: string[] }[]> = {};

  /** Envía el webhook como lo haría Meta, con la firma del cuerpo crudo. */
  const hook = (
    leadgenId: string,
    opts: { badSig?: boolean; formId?: string } = {},
  ) => {
    const body = JSON.stringify({
      object: 'page',
      entry: [
        {
          id: PAGE,
          time: 1764000000,
          changes: [
            {
              field: 'leadgen',
              value: {
                leadgen_id: leadgenId,
                page_id: PAGE,
                form_id: opts.formId ?? 'F1',
                ad_id: 'AD9',
                adgroup_id: 'AS1',
                created_time: Math.floor(Date.now() / 1000),
              },
            },
          ],
        },
      ],
    });
    const sig = createHmac('sha256', opts.badSig ? 'otro' : SECRET)
      .update(body)
      .digest('hex');
    return http()
      .post('/messenger/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', `sha256=${sig}`)
      .send(body)
      .expect(200);
  };

  const settled = async (leadgenId: string) => {
    for (let i = 0; i < 80; i++) {
      const r = await log.findOne({ leadgenId }).lean().exec();
      if (r && r.status !== 'pending' && !r.lockedUntil) return r;
      await wait(30);
    }
    return log.findOne({ leadgenId }).lean().exec();
  };

  beforeAll(async () => {
    process.env.FACEBOOK_APP_SECRET = SECRET;
    app = await createApp();
    owner = await registerTenant(app, 'Inmobiliaria');
    customers = app.get(getModelToken(Customer.name));
    leads = app.get(getModelToken(Lead.name));
    log = app.get(getModelToken(LeadAdLead.name));
    const accounts: Model<MessengerAccount> = app.get(
      getModelToken(MessengerAccount.name),
    );
    await accounts.create({
      tenantId: new Types.ObjectId(owner.user.tenantId as string),
      label: 'Página',
      pageId: PAGE,
      pageName: 'Inmo',
      pageAccessToken: 'PAGE-TOKEN',
      active: true,
    });
    jest
      .spyOn(app.get(PushService), 'sendToTenant')
      .mockResolvedValue(undefined as never);
    graphGet = jest
      .spyOn(app.get(MetaGraphClient), 'get')
      .mockImplementation((path: string) => {
        if (failGraph) return Promise.reject(new Error('Meta caída'));
        if (path === '/F1')
          return Promise.resolve({
            name: 'Depas Miraflores',
            questions: [
              { key: 'full_name' },
              { key: 'presupuesto', label: 'Presupuesto' },
            ],
          });
        if (path === `/${PAGE}/leadgen_forms`)
          return Promise.resolve({
            data: [
              {
                id: 'F1',
                name: 'Depas Miraflores',
                questions: [{ key: 'full_name' }],
              },
              { id: 'F2', name: 'Casas' },
            ],
          });
        const id = path.slice(1);
        return Promise.resolve({
          id,
          form_id: 'F1',
          ad_id: 'AD9',
          ad_name: 'Depa 2 dorm',
          adset_id: 'AS1',
          adset_name: 'Lima 25-45',
          campaign_id: 'C7',
          campaign_name: 'Lanzamiento',
          field_data: answers[id] ?? [],
        });
      });
  });

  afterAll(async () => {
    process.env.FACEBOOK_APP_SECRET = prevSecret;
    await app.close();
  });

  it('C1: un leadgen simulado crea el contacto con respuestas, origen del anuncio y oportunidad', async () => {
    answers.L1 = [
      { name: 'full_name', values: ['Ana Pérez'] },
      { name: 'email', values: ['ana@inmo.pe'] },
      { name: 'phone_number', values: ['+51 987 111 222'] },
      { name: 'presupuesto', values: ['US$ 120 000'] },
    ];
    await hook('L1');
    const row = await settled('L1');
    expect(row?.status).toBe('processed');
    expect(row).toMatchObject({
      adName: 'Depa 2 dorm',
      campaignName: 'Lanzamiento',
      adsetName: 'Lima 25-45',
      formName: 'Depas Miraflores',
    });
    expect(graphGet).toHaveBeenCalledWith(
      '/L1',
      expect.objectContaining({ accessToken: 'PAGE-TOKEN' }),
    );
    const c = await customers.findById(row?.customerId).lean().exec();
    expect(c).toMatchObject({
      name: 'Ana Pérez',
      email: 'ana@inmo.pe',
      source: 'lead_ads',
      customFields: { presupuesto: 'US$ 120 000' },
    });
    expect(c?.adReferral).toMatchObject({
      adId: 'AD9',
      headline: 'Depa 2 dorm',
      sourceType: 'lead_ad',
    });
    const lead = await leads.findById(row?.leadId).lean().exec();
    expect(lead).toMatchObject({ source: 'lead_ads', status: 'open' });
    expect(lead?.ownerId ?? null).toBeNull();

    const report = (
      await http().get('/lead-ads/report').set(bearer(owner)).expect(200)
    ).body as { _id: string; fromLeadAds: number; opportunities: number }[];
    expect(report.find((r) => r._id === 'AD9')).toMatchObject({
      fromLeadAds: 1,
      opportunities: 1,
    });
    const forms = (
      await http().get('/lead-ads/forms').set(bearer(owner)).expect(200)
    ).body as { formId: string; leadsCount: number }[];
    expect(forms.find((f) => f.formId === 'F1')?.leadsCount).toBe(1);
  });

  it('C2: el mismo lead dos veces no duplica; otro lead del mismo teléfono actualiza el contacto', async () => {
    const before = await customers.countDocuments({
      tenantId: new Types.ObjectId(owner.user.tenantId as string),
    });
    const leadsBefore = await leads.countDocuments({ source: 'lead_ads' });
    await hook('L1');
    await wait(200);
    expect(await log.countDocuments({ leadgenId: 'L1' })).toBe(1);

    answers.L2 = [
      { name: 'full_name', values: ['Otro Nombre'] },
      { name: 'phone_number', values: ['51987111222'] },
      { name: 'cuando', values: ['Este mes'] },
    ];
    await hook('L2');
    const row = await settled('L2');
    expect(row?.status).toBe('processed');
    expect(row?.existingContact).toBe(true);
    expect(
      await customers.countDocuments({
        tenantId: new Types.ObjectId(owner.user.tenantId as string),
      }),
    ).toBe(before);
    const c = await customers.findById(row?.customerId).lean().exec();
    expect(c?.name).toBe('Ana Pérez'); // no se pisa
    expect(c?.customFields).toMatchObject({
      presupuesto: 'US$ 120 000',
      cuando: 'Este mes',
    });
    expect(await leads.countDocuments({ source: 'lead_ads' })).toBe(
      leadsBefore + 1,
    );
  });

  it('C3: firma inválida se descarta; si Meta falla queda fallido y el reintento lo procesa', async () => {
    answers.L3 = [
      { name: 'full_name', values: ['Sin firma'] },
      { name: 'email', values: ['x@y.pe'] },
    ];
    await hook('L3', { badSig: true });
    await wait(200);
    expect(await log.exists({ leadgenId: 'L3' })).toBeNull();

    answers.L4 = [
      { name: 'full_name', values: ['Luis'] },
      { name: 'email', values: ['luis@y.pe'] },
    ];
    failGraph = true;
    await hook('L4');
    const failed = await settled('L4');
    expect(failed).toMatchObject({
      status: 'failed',
      error: 'Meta caída',
      attempts: 1,
    });
    failGraph = false;
    const res = await http()
      .post(`/lead-ads/leads/${String(failed?._id)}/retry`)
      .set(bearer(owner))
      .expect(201);
    expect((res.body as { status: string }).status).toBe('processed');
    expect(await customers.exists({ email: 'luis@y.pe' })).toBeTruthy();

    // El cron también reintenta.
    failGraph = true;
    answers.L5 = [{ name: 'email', values: ['cron@y.pe'] }];
    await hook('L5');
    await settled('L5');
    failGraph = false;
    expect(await app.get(LeadAdsService).retryFailed()).toBe(1);
    expect((await log.findOne({ leadgenId: 'L5' }).lean().exec())?.status).toBe(
      'processed',
    );
  });

  it('formularios: sincroniza, mapea, pausa; solo gestores y de su empresa', async () => {
    const sync = (
      await http().post('/lead-ads/forms/sync').set(bearer(owner)).expect(201)
    ).body as { synced: number; forms: { _id: string; formId: string }[] };
    expect(sync.synced).toBe(2);
    const f2 = sync.forms.find((f) => f.formId === 'F2')!;
    await http()
      .put(`/lead-ads/forms/${f2._id}`)
      .set(bearer(owner))
      .send({ mapping: { dni: 'nada' } })
      .expect(400);
    await http()
      .put(`/lead-ads/forms/${f2._id}`)
      .set(bearer(owner))
      .send({ mapping: { celular: 'phone', dni: 'ignore' }, createLead: false })
      .expect(200);

    answers.L6 = [
      { name: 'full_name', values: ['Rosa'] },
      { name: 'celular', values: ['+51 966 555 444'] },
      { name: 'dni', values: ['123'] },
    ];
    // Graph responde que el lead es del formulario F2.
    graphGet.mockImplementationOnce(() =>
      Promise.resolve({ id: 'L7', form_id: 'F2', field_data: answers.L6 }),
    );
    await hook('L7', { formId: 'F2' });
    const row = await settled('L7');
    expect(row?.status).toBe('processed');
    expect(row?.leadId).toBeUndefined();
    const c = await customers.findById(row?.customerId).lean().exec();
    expect(c?.phone).toBeTruthy();
    expect(c?.customFields?.dni).toBeUndefined();

    await http()
      .put(`/lead-ads/forms/${f2._id}`)
      .set(bearer(owner))
      .send({ active: false })
      .expect(200);
    graphGet.mockImplementationOnce(() =>
      Promise.resolve({ id: 'L8', form_id: 'F2', field_data: answers.L6 }),
    );
    await hook('L8', { formId: 'F2' });
    expect((await settled('L8'))?.status).toBe('skipped');

    const seller = await createUser(app, owner, 'IMPULSADOR');
    await http().get('/lead-ads/forms').set(bearer(seller)).expect(403);
    const other = await registerTenant(app, 'Otra');
    expect(
      (
        (await http().get('/lead-ads/leads').set(bearer(other)).expect(200))
          .body as unknown[]
      ).length,
    ).toBe(0);
    await http()
      .put(`/lead-ads/forms/${f2._id}`)
      .set(bearer(other))
      .send({ active: true })
      .expect(404);
  });
});
