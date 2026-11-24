import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  bearer,
  createApp,
  createUser,
  registerTenant,
  type Session,
} from './support/app';
import { AddonsService } from '../src/billing/addons.service';
import {
  MercadoPagoClient,
  type MpPayment,
} from '../src/billing/mercadopago/mercadopago.client';
import { PaymentsService } from '../src/billing/payments.service';
import { MailService } from '../src/mail/mail.service';
import { BillingAccessService } from '../src/billing/billing-access.service';
import { AiCreditsService } from '../src/billing/ai-credits.service';
import { PlanLimitsService } from '../src/billing/plan-limits.service';
import { NubefactProvider } from '../src/billing/invoicing/nubefact.provider';
import { InvoicingService } from '../src/billing/invoicing/invoicing.service';
import { Payment } from '../src/billing/payment.schema';
import { Tenant } from '../src/tenants/tenant.schema';

const DAY = 86400_000;
const wait = (ms = 100) => new Promise((r) => setTimeout(r, ms));
let seq = 0;

/** HU53: add-ons mensuales y recargas. */
describe('Add-ons y recargas (HU53)', () => {
  let app: NestExpressApplication;
  let tenants: Model<Tenant>;
  let updatePre: jest.SpyInstance;
  let issue: jest.SpyInstance;
  const http = () => request(app.getHttpServer());

  const setup = async (
    s: Session,
    plan: string,
    sub: Record<string, unknown> | null,
  ) => {
    const tid = s.user.tenantId!;
    await tenants.updateOne(
      { _id: tid },
      {
        $set: {
          plan,
          billingInfo: {
            docType: 'factura',
            docNumber: '20123456789',
            legalName: 'Cliente SAC',
            address: 'Av. Lima 1',
          },
          ...(sub ? { subscription: sub } : {}),
        },
      },
    );
    app.get(BillingAccessService).invalidate(tid);
    return tid;
  };
  const pay = async (session: string, total: number) => {
    const p: MpPayment = {
      id: `addon-${++seq}`,
      status: 'approved',
      transaction_amount: total,
      currency_id: 'PEN',
      external_reference: session,
      payment_type_id: 'credit_card',
      date_approved: new Date().toISOString(),
    };
    await app.get(PaymentsService).syncFromMp(p);
    await wait();
    return p;
  };

  beforeAll(async () => {
    process.env.MP_ACCESS_TOKEN = 'TEST-token';
    app = await createApp();
    jest.spyOn(app.get(MailService), 'sendHtml').mockResolvedValue('mock');
    jest
      .spyOn(app.get(MercadoPagoClient), 'createPreference')
      .mockResolvedValue({
        id: 'pref-addon',
        init_point: 'https://mp.test/addon',
      });
    updatePre = jest
      .spyOn(app.get(MercadoPagoClient), 'updatePreapproval')
      .mockResolvedValue({ id: 'x', status: 'ok' });
    const nf = app.get(NubefactProvider);
    jest.spyOn(nf, 'configured').mockReturnValue(true);
    jest.spyOn(nf, 'find').mockResolvedValue(null);
    issue = jest.spyOn(nf, 'issue').mockResolvedValue({
      pdfUrl: 'https://nf.test/a.pdf',
      xmlUrl: 'https://nf.test/a.xml',
    });
    tenants = app.get(getModelToken(Tenant.name));
  });
  afterAll(async () => {
    delete process.env.MP_ACCESS_TOKEN;
    await app.close();
  });

  it('C1: 1.000 créditos aprobados suben el saldo en 1.000 y generan comprobante', async () => {
    const owner = await registerTenant(app, 'Creditos SAC');
    // En prueba también se puede recargar.
    const tid = await setup(owner, 'crece', null);
    const before = (await app.get(AiCreditsService).balance(tid)).purchased;
    const res = (
      await http()
        .post('/billing/addons/buy')
        .set(bearer(owner))
        .send({ addon: 'credits_1000' })
        .expect(201)
    ).body as { session: string; total: number; subtotal: number };
    expect(res.subtotal).toBe(49);
    expect(res.total).toBe(57.82);
    const p = await pay(res.session, res.total);
    const b = await app.get(AiCreditsService).balance(tid);
    expect(b.purchased - before).toBe(1000);
    expect(b.purchasedExpiresAt!.getTime()).toBeGreaterThan(
      Date.now() + 360 * DAY,
    );

    await app.get(InvoicingService).drain();
    const payment = await app
      .get<Model<Payment>>(getModelToken(Payment.name))
      .findOne({ providerPaymentId: String(p.id) })
      .lean();
    expect(payment!.receipt!.status).toBe('issued');
    const body = (
      issue.mock.calls.at(-1) as [{ items: { description: string }[] }]
    )[0];
    expect(JSON.stringify(body)).toContain('1.000 créditos de IA');
    // Repetir el webhook no suma dos veces.
    await pay(res.session, res.total).catch(() => undefined);
    expect(
      (await app.get(AiCreditsService).balance(tid)).purchased - before,
    ).toBe(1000);
  });

  it('C2: un usuario extra en Inicia permite el 3.er usuario y suma S/ 39 al siguiente cobro mensual', async () => {
    const owner = await registerTenant(app, 'Usuario Extra SAC');
    const tid = await setup(owner, 'inicia', {
      status: 'active',
      period: 'monthly',
      currency: 'PEN',
      amount: 99,
      currentPeriodEnd: new Date(Date.now() + 15 * DAY),
      mpPreapprovalId: 'pre-addon',
    });
    const mk = (n: number) =>
      http()
        .post('/users')
        .set(bearer(owner))
        .send({
          name: `U${n}`,
          email: `extra${n}-${Date.now()}@e2e.test`,
          role: 'MARKETING',
        });
    await mk(2).expect(201);
    await mk(3).expect(402);

    const list = (
      await http().get('/billing/addons').set(bearer(owner)).expect(200)
    ).body as {
      addons: { id: string; dueNow: number; available: boolean }[];
    };
    const extra = list.addons.find((a) => a.id === 'extra_user')!;
    expect(extra.available).toBe(true);
    // Mitad del mes: ~la mitad de S/ 39.
    expect(extra.dueNow).toBeGreaterThan(17);
    expect(extra.dueNow).toBeLessThan(22);

    const res = (
      await http()
        .post('/billing/addons/buy')
        .set(bearer(owner))
        .send({ addon: 'extra_user' })
        .expect(201)
    ).body as { session: string; total: number };
    updatePre.mockClear();
    await pay(res.session, res.total);
    const t = (await tenants.findById(tid).lean())!;
    expect(t.addons?.users).toBe(1);
    expect(t.subscription!.amount).toBe(138);
    expect(t.plan).toBe('inicia');
    expect((await app.get(PlanLimitsService).effective(tid)).limits.users).toBe(
      3,
    );
    expect(updatePre).toHaveBeenCalledWith('pre-addon', {
      auto_recurring: { transaction_amount: 162.84, currency_id: 'PEN' },
    });
    await mk(4).expect(201);
  });

  it('los extras mensuales piden un plan pagado; solo el administrador compra', async () => {
    const owner = await registerTenant(app, 'Sin Plan SAC');
    await setup(owner, 'crece', null);
    await http()
      .post('/billing/addons/buy')
      .set(bearer(owner))
      .send({ addon: 'extra_whatsapp' })
      .expect(400);
    await http()
      .post('/billing/addons/buy')
      .set(bearer(owner))
      .send({ addon: 'nada' })
      .expect(400);
  });

  it('recarga de emails: lo que pasa del plan del mes se descuenta de la recarga', async () => {
    const owner = await registerTenant(app, 'Emails SAC');
    const tid = await setup(owner, 'inicia', null);
    const limits = app.get(PlanLimitsService);
    // Inicia: 1.000 al mes. Sin recarga, 1.500 no pasa.
    await expect(limits.reserveCampaignEmails(tid, 1500)).rejects.toMatchObject(
      { status: 402 },
    );
    await tenants.updateOne(
      { _id: tid },
      {
        $set: {
          campaignEmailsPurchased: 10_000,
          campaignEmailsPurchasedExpiresAt: new Date(Date.now() + 30 * DAY),
        },
      },
    );
    await limits.reserveCampaignEmails(tid, 1500);
    expect((await tenants.findById(tid).lean())!.campaignEmailsPurchased).toBe(
      9500,
    );
    // Vencida no cuenta.
    await tenants.updateOne(
      { _id: tid },
      {
        $set: { campaignEmailsPurchasedExpiresAt: new Date(Date.now() - 1000) },
      },
    );
    await expect(limits.reserveCampaignEmails(tid, 1500)).rejects.toMatchObject(
      { status: 402 },
    );
  });

  it('solo el administrador compra; el prorrateo menor a 1 aplica sin cobro', async () => {
    const owner = await registerTenant(app, 'Roles SAC');
    const tid = await setup(owner, 'crece', {
      status: 'active',
      period: 'monthly',
      currency: 'PEN',
      amount: 249,
      currentPeriodEnd: new Date(Date.now() + 3600_000),
    });
    const mkt = await createUser(app, owner, 'MARKETING');
    await http().get('/billing/addons').set(bearer(mkt)).expect(403);
    await http()
      .post('/billing/addons/buy')
      .set(bearer(mkt))
      .send({ addon: 'credits_1000' })
      .expect(403);
    // Queda menos de una hora: el prorrateo de S/ 49 es menor a 1.
    const r = (
      await http()
        .post('/billing/addons/buy')
        .set(bearer(owner))
        .send({ addon: 'extra_whatsapp' })
        .expect(201)
    ).body as { applied?: boolean };
    expect(r.applied).toBe(true);
    const t = (await tenants.findById(tid).lean())!;
    expect(t.addons?.whatsappNumbers).toBe(1);
    expect(t.subscription!.amount).toBe(298);
  });

  it('la misma compra no se aplica dos veces y dos compras a la vez suman las dos', async () => {
    const owner = await registerTenant(app, 'Carrera SAC');
    const tid = await setup(owner, 'inicia', {
      status: 'active',
      period: 'quarterly',
      currency: 'PEN',
      amount: 282,
      currentPeriodEnd: new Date(Date.now() + 60 * DAY),
    });
    const svc = app.get(AddonsService);
    const runs = await Promise.all([
      svc.apply(tid, 'extra_user', 1, 'compra-a'),
      svc.apply(tid, 'extra_user', 1, 'compra-a'),
      svc.apply(tid, 'extra_user', 1, 'compra-b'),
    ]);
    expect(runs.filter(Boolean)).toHaveLength(2);
    const t = (await tenants.findById(tid).lean())!;
    expect(t.addonItems?.extra_user).toBe(2);
    expect(t.addons?.users).toBe(2);
    // Trimestral: 2 × 39 × 3 meses entran en la renovación.
    expect(t.subscription!.amount).toBe(282 + 234);
  });

  it('recarga sobre un saldo vencido lo reemplaza; dos recargas a la vez suman las dos', async () => {
    const owner = await registerTenant(app, 'Vencida SAC');
    const tid = await setup(owner, 'crece', null);
    await tenants.updateOne(
      { _id: tid },
      {
        $set: {
          aiCreditsPurchased: 700,
          aiCreditsPurchasedExpiresAt: new Date(Date.now() - DAY),
        },
      },
    );
    const svc = app.get(AddonsService);
    await Promise.all([
      svc.apply(tid, 'credits_1000', 1, 'r1'),
      svc.apply(tid, 'credits_1000', 1, 'r2'),
    ]);
    expect((await tenants.findById(tid).lean())!.aiCreditsPurchased).toBe(2000);
  });

  it('el cupo de emails cuenta lo encolado: dos campañas no usan el mismo cupo y un fallo lo devuelve', async () => {
    const owner = await registerTenant(app, 'Cupo SAC');
    const tid = await setup(owner, 'inicia', null);
    const limits = app.get(PlanLimitsService);
    // Inicia: 1.000 al mes, sin recarga.
    await limits.reserveCampaignEmails(tid, 1000);
    await expect(limits.reserveCampaignEmails(tid, 1000)).rejects.toMatchObject(
      { status: 402 },
    );
    await tenants.updateOne(
      { _id: tid },
      {
        $set: {
          campaignEmailsPurchased: 500,
          campaignEmailsPurchasedExpiresAt: new Date(Date.now() + DAY),
        },
      },
    );
    const r = await limits.reserveCampaignEmails(tid, 300);
    expect(r!.fromPurchased).toBe(300);
    expect((await tenants.findById(tid).lean())!.campaignEmailsPurchased).toBe(
      200,
    );
    await limits.refundCampaignEmails(tid, r);
    const t = (await tenants.findById(tid).lean())!;
    expect(t.campaignEmailsPurchased).toBe(500);
    expect(t.emailQuota!.queued).toBe(1000);
  });
});
