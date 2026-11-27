import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Tenant } from '../src/tenants/tenant.schema';
import { BillingAccessService } from '../src/billing/billing-access.service';
import { bearer, createApp, registerTenant, type Session } from './support/app';

type Body = Record<string, unknown>;

/** HU41/HU87: sin prueba gratis; una prueba histórica vencida queda en solo lectura. */
describe('Cobro: acceso por estado (HU41, HU87)', () => {
  let app: NestExpressApplication;
  let owner: Session;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createApp();
    owner = await registerTenant(app, 'Prueba gratis');
  });
  afterAll(async () => {
    await app.close();
  });

  it('HU87 C2: la empresa nueva no nace en prueba gratis', async () => {
    const res = await http()
      .get('/billing/status')
      .set(bearer(owner))
      .expect(200);
    const body = res.body as Body;
    expect(body.status).not.toBe('trialing');
    expect(body.trialDaysLeft).toBeUndefined();
    expect(body.trialEndsAt).toBeUndefined();
    expect(body.readOnly).toBe(false);
    const t = await app
      .get<Model<Tenant>>(getModelToken(Tenant.name))
      .findById(owner.user.tenantId)
      .lean()
      .exec();
    expect(t?.trialEndsAt).toBeUndefined();
    expect(t?.subscription).toBeUndefined();
  });

  it('C2 (HU41, datos históricos): con la prueba vencida las escrituras dan 402 y las lecturas siguen', async () => {
    const tenantId = owner.user.tenantId!;
    await app
      .get<Model<Tenant>>(getModelToken(Tenant.name))
      .updateOne(
        { _id: tenantId },
        { $set: { trialEndsAt: new Date(Date.now() - 1000) } },
      );
    app.get(BillingAccessService).invalidate(tenantId);

    const res = await http()
      .post('/customers')
      .set(bearer(owner))
      .send({ name: 'Ana', phone: '+51999111222' })
      .expect(402);
    expect(res.body).toMatchObject({
      code: 'SUBSCRIPTION_REQUIRED',
      message: 'Tu prueba terminó, elige un plan',
    });
    await http().get('/customers').set(bearer(owner)).expect(200);
    const status = await http()
      .get('/billing/status')
      .set(bearer(owner))
      .expect(200);
    expect(status.body).toMatchObject({ status: 'expired', readOnly: true });
  });

  it('HU43: GET /billing/credits devuelve el saldo del mes del plan Crece', async () => {
    const body = (
      await http().get('/billing/credits').set(bearer(owner)).expect(200)
    ).body as Body;
    expect(body).toMatchObject({
      unlimited: false,
      included: 3000,
      usedFromPlan: 0,
      remaining: 3000,
    });
    expect(body.period).toMatch(/^\d{4}-\d{2}$/);
  });

  it('HU43: el consumo por empresa es solo para SUPERADMIN', async () => {
    await http().get('/billing/admin/ai-usage').set(bearer(owner)).expect(403);
  });
});
