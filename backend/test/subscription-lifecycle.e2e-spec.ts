import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { createApp, registerTenant } from './support/app';
import {
  MercadoPagoClient,
  type MpPayment,
} from '../src/billing/mercadopago/mercadopago.client';
import { PaymentsService } from '../src/billing/payments.service';
import { MailService } from '../src/mail/mail.service';
import { Tenant } from '../src/tenants/tenant.schema';
import { Payment } from '../src/billing/payment.schema';
import {
  SubscriptionLifecycleService,
  addMonths,
} from '../src/billing/subscription-lifecycle.service';

const DAY = 86400_000;
let seq = 0;
function pay(ref: string, extra: Partial<MpPayment> = {}): MpPayment {
  return {
    id: `hu48-${++seq}`,
    status: 'approved',
    transaction_amount: 1,
    currency_id: 'PEN',
    external_reference: ref,
    payment_type_id: 'credit_card',
    date_approved: new Date().toISOString(),
    ...extra,
  };
}

/** HU48: ciclo de vida y renovaciones. */
describe('Ciclo de vida de la suscripción (HU48)', () => {
  let app: NestExpressApplication;
  let tenants: Model<Tenant>;
  let payments: Model<Payment>;
  let preference: jest.SpyInstance;
  let sendHtml: jest.SpyInstance;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    process.env.MP_ACCESS_TOKEN = 'TEST-token';
    app = await createApp();
    const mp = app.get(MercadoPagoClient);
    jest.spyOn(mp, 'createPreapproval').mockResolvedValue({
      id: 'pre-hu48',
      status: 'pending',
      init_point: 'https://mp.test/pre',
    });
    preference = jest
      .spyOn(mp, 'createPreference')
      .mockResolvedValue({ id: 'pref', init_point: 'https://mp.test/renovar' });
    sendHtml = jest
      .spyOn(app.get(MailService), 'sendHtml')
      .mockResolvedValue('mock');
    tenants = app.get(getModelToken(Tenant.name));
    payments = app.get(getModelToken(Payment.name));
  });
  afterAll(async () => {
    delete process.env.MP_ACCESS_TOKEN;
    await app.close();
  });

  it('addMonths no se pasa de fin de mes', () => {
    expect(addMonths(new Date(2026, 0, 31), 1).getDate()).toBe(28);
    expect(addMonths(new Date(2026, 4, 15), 1).getMonth()).toBe(5);
  });

  it('C1: cada cobro mensual aprobado avanza el periodo exactamente un mes, una sola vez', async () => {
    const owner = await registerTenant(app, 'Mensual');
    const session = (
      (
        await http()
          .post('/billing/checkout')
          .set({ Authorization: `Bearer ${owner.token}` })
          .send({
            plan: 'inicia',
            period: 'mensual',
            currency: 'PEN',
            buyer: { company: 'Mensual SAC', name: 'Ana', email: owner.email },
            billing: {
              docType: 'boleta',
              docNumber: '12345678',
              legalName: 'Ana',
            },
            acceptTerms: true,
          })
          .expect(201)
      ).body as { session: string }
    ).session;
    const svc = app.get(PaymentsService);
    // Primer cobro = la compra: lo activa el alta, no es renovación.
    await svc.syncFromMp(pay(session, { preapproval_id: 'pre-hu48' }));
    const t1 = (await tenants.findById(owner.user.tenantId).lean())!;
    expect(t1.subscription).toMatchObject({
      status: 'active',
      mpPreapprovalId: 'pre-hu48',
    });
    const end1 = t1.subscription!.currentPeriodEnd!;

    const renewal = pay(session, { preapproval_id: 'pre-hu48' });
    await svc.syncFromMp(renewal);
    await svc.syncFromMp(renewal); // el mismo aviso otra vez
    const t2 = (await tenants.findById(owner.user.tenantId).lean())!;
    expect(t2.subscription!.currentPeriodEnd!.getTime()).toBe(
      addMonths(end1, 1).getTime(),
    );
    const p = (await payments
      .findOne({ providerPaymentId: renewal.id })
      .lean())!;
    expect(p).toMatchObject({ kind: 'renewal', periodApplied: true });
    expect(String(p.tenantId)).toBe(owner.user.tenantId);
  });

  it('C2 + C3: el aviso anual sale 7 días antes, una vez, al precio pactado; al pagarlo suma el periodo', async () => {
    const owner = await registerTenant(app, 'Anual');
    const end = new Date(Date.now() + 5 * DAY);
    // Precio pactado 500 (el catálogo hoy dice otra cosa).
    await tenants.updateOne(
      { _id: owner.user.tenantId },
      {
        $set: {
          plan: 'crece',
          subscription: {
            status: 'active',
            period: 'annual',
            currency: 'PEN',
            amount: 500,
            currentPeriodEnd: end,
          },
        },
      },
    );
    preference.mockClear();
    sendHtml.mockClear();
    const life = app.get(SubscriptionLifecycleService);
    await life.sendRenewalNotices();
    await life.sendRenewalNotices();
    const mine = sendHtml.mock.calls.filter(
      (c) => (c as [{ to: string }])[0].to === owner.email,
    );
    expect(mine).toHaveLength(1);
    expect((mine[0] as [{ html: string }])[0].html).toContain(
      'https://mp.test/renovar',
    );
    expect(preference).toHaveBeenCalledTimes(1);
    const [body] = preference.mock.calls[0] as [
      { items: { unit_price: number }[]; external_reference: string },
    ];
    expect(body.items[0].unit_price).toBe(590);

    await app.get(PaymentsService).syncFromMp(pay(body.external_reference));
    const t = (await tenants.findById(owner.user.tenantId).lean())!;
    expect(t.subscription!.currentPeriodEnd!.getTime()).toBe(
      addMonths(end, 12).getTime(),
    );
    expect(t.subscription!.amount).toBe(500);
  });

  it('un plan anual 10 días antes todavía no recibe aviso', async () => {
    const owner = await registerTenant(app, 'Lejos');
    await tenants.updateOne(
      { _id: owner.user.tenantId },
      {
        $set: {
          subscription: {
            status: 'active',
            period: 'annual',
            currency: 'PEN',
            amount: 500,
            currentPeriodEnd: new Date(Date.now() + 10 * DAY),
          },
        },
      },
    );
    sendHtml.mockClear();
    await app.get(SubscriptionLifecycleService).sendRenewalNotices();
    expect(
      sendHtml.mock.calls.some(
        (c) => (c as [{ to: string }])[0].to === owner.email,
      ),
    ).toBe(false);
  });

  it('vencido sin cobro pasa a past_due con gracia', async () => {
    const owner = await registerTenant(app, 'Vencida');
    await tenants.updateOne(
      { _id: owner.user.tenantId },
      {
        $set: {
          subscription: {
            status: 'active',
            period: 'annual',
            currency: 'PEN',
            amount: 500,
            currentPeriodEnd: new Date(Date.now() - DAY),
          },
        },
      },
    );
    await app.get(SubscriptionLifecycleService).markPastDue();
    const t = (await tenants.findById(owner.user.tenantId).lean())!;
    expect(t.subscription!.status).toBe('past_due');
    expect(t.subscription!.graceEndsAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('dos cobros mensuales distintos a la vez suman dos meses, no uno', async () => {
    const owner = await registerTenant(app, 'Paralelo');
    const end = new Date(Date.now() + 3 * DAY);
    await tenants.updateOne(
      { _id: owner.user.tenantId },
      {
        $set: {
          subscription: {
            status: 'active',
            period: 'monthly',
            currency: 'PEN',
            amount: 99,
            currentPeriodEnd: end,
            mpPreapprovalId: 'pre-par',
          },
        },
      },
    );
    const svc = app.get(PaymentsService);
    await Promise.all([
      svc.syncFromMp(
        pay('', { external_reference: undefined, preapproval_id: 'pre-par' }),
      ),
      svc.syncFromMp(
        pay('', { external_reference: undefined, preapproval_id: 'pre-par' }),
      ),
    ]);
    const t = (await tenants.findById(owner.user.tenantId).lean())!;
    expect(t.subscription!.currentPeriodEnd!.getTime()).toBe(
      addMonths(end, 2).getTime(),
    );
  });

  it('mensual: Mercado Pago tiene 2 días de margen antes de marcar impago', async () => {
    const owner = await registerTenant(app, 'Margen');
    await tenants.updateOne(
      { _id: owner.user.tenantId },
      {
        $set: {
          subscription: {
            status: 'active',
            period: 'monthly',
            currency: 'PEN',
            amount: 99,
            currentPeriodEnd: new Date(Date.now() - DAY),
          },
        },
      },
    );
    const life = app.get(SubscriptionLifecycleService);
    await life.markPastDue();
    expect(
      (await tenants.findById(owner.user.tenantId).lean())!.subscription!
        .status,
    ).toBe('active');
    await life.markPastDue(new Date(Date.now() + 2 * DAY));
    expect(
      (await tenants.findById(owner.user.tenantId).lean())!.subscription!
        .status,
    ).toBe('past_due');
  });
});
