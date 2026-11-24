import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { ADMIN, bearer, createApp, login, registerTenant } from './support/app';
import {
  MercadoPagoClient,
  type MpPayment,
} from '../src/billing/mercadopago/mercadopago.client';
import { PaymentsService } from '../src/billing/payments.service';
import { MailService } from '../src/mail/mail.service';
import { NubefactProvider } from '../src/billing/invoicing/nubefact.provider';
import { InvoicingService } from '../src/billing/invoicing/invoicing.service';
import { CouponsService } from '../src/billing/coupons/coupons.service';
import { Coupon } from '../src/billing/coupons/coupon.schema';
import { CheckoutSession } from '../src/billing/checkout-session.schema';
import { Tenant } from '../src/tenants/tenant.schema';
import { TenantsService } from '../src/tenants/tenants.service';
import { SubscriptionLifecycleService } from '../src/billing/subscription-lifecycle.service';

const DAY = 86400_000;
const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));
const boleta = {
  docType: 'boleta',
  docNumber: '12345678',
  legalName: 'Ana Pérez',
};
let seq = 0;

/** HU54: precio fundador y cupones. */
describe('Precio fundador y cupones (HU54)', () => {
  let app: NestExpressApplication;
  let coupons: Model<Coupon>;
  let sessions: Model<CheckoutSession>;
  let tenants: Model<Tenant>;
  let issue: jest.SpyInstance;
  let createPref: jest.SpyInstance;
  const http = () => request(app.getHttpServer());

  const buy = (email: string, period: string, coupon?: string) =>
    http()
      .post('/public/checkout')
      .send({
        plan: 'crece',
        period,
        currency: 'PEN',
        buyer: { company: `Empresa ${email}`, name: 'Ana Pérez', email },
        billing: boleta,
        acceptTerms: true,
        ...(coupon ? { coupon } : {}),
      });

  const approve = async (session: string, total: number) => {
    const p: MpPayment = {
      id: `cup-${++seq}`,
      status: 'approved',
      transaction_amount: total,
      currency_id: 'PEN',
      external_reference: session,
      payment_type_id: 'credit_card',
      date_approved: new Date().toISOString(),
    };
    await app.get(PaymentsService).syncFromMp(p);
    await wait();
  };

  beforeAll(async () => {
    process.env.MP_ACCESS_TOKEN = 'TEST-token';
    app = await createApp();
    jest.spyOn(app.get(MailService), 'sendHtml').mockResolvedValue('mock');
    createPref = jest
      .spyOn(app.get(MercadoPagoClient), 'createPreference')
      .mockResolvedValue({ id: 'pref', init_point: 'https://mp.test/pref' });
    const nf = app.get(NubefactProvider);
    jest.spyOn(nf, 'configured').mockReturnValue(true);
    jest.spyOn(nf, 'find').mockResolvedValue(null);
    issue = jest.spyOn(nf, 'issue').mockResolvedValue({
      pdfUrl: 'https://nf.test/a.pdf',
      xmlUrl: 'https://nf.test/a.xml',
    });
    coupons = app.get(getModelToken(Coupon.name));
    sessions = app.get(getModelToken(CheckoutSession.name));
    tenants = app.get(getModelToken(Tenant.name));
    await app.get(CouponsService).onModuleInit();
  });
  afterAll(async () => {
    delete process.env.MP_ACCESS_TOKEN;
    await app.close();
  });

  it('el cupón FUNDADOR existe con 30 cupos y la landing ve los que quedan', async () => {
    const f = (await http().get('/public/checkout/founder').expect(200))
      .body as { remaining: number; active: boolean };
    expect(f).toMatchObject({ active: true, remaining: 30 });
  });

  it('C1: Crece anual con FUNDADOR = 2.490 × 0,7 = S/ 1.743 + IGV en el checkout, la suscripción y el comprobante', async () => {
    const q = (
      await http()
        .get('/public/checkout/quote')
        .query({
          plan: 'crece',
          period: 'anual',
          currency: 'PEN',
          coupon: 'fundador',
        })
        .expect(200)
    ).body as {
      listSubtotal: number;
      discount: number;
      subtotal: number;
      igv: number;
      total: number;
    };
    expect(q).toMatchObject({
      listSubtotal: 2490,
      discount: 747,
      subtotal: 1743,
      igv: 313.74,
      total: 2056.74,
    });

    const res = (
      await buy('fundador1@e2e.test', 'anual', 'FUNDADOR').expect(201)
    ).body as { session: string; total: number };
    expect(res.total).toBe(2056.74);
    const item = (
      createPref.mock.calls.at(-1) as [{ items: { unit_price: number }[] }]
    )[0].items[0];
    expect(item.unit_price).toBe(2056.74);
    expect((await coupons.findOne({ code: 'FUNDADOR' }).lean())!.used).toBe(1);

    await approve(res.session, res.total);
    const t = (await tenants.findOne({ email: 'fundador1@e2e.test' }).lean())!;
    expect(t.subscription).toMatchObject({
      status: 'active',
      period: 'annual',
      amount: 1743,
      discount: { code: 'FUNDADOR', type: 'percent', value: 30 },
    });
    expect(t.subscription!.discount!.endsAt).toBeUndefined();

    await app.get(InvoicingService).drain();
    const req = (
      issue.mock.calls.at(-1) as [Parameters<typeof NubefactProvider.body>[0]]
    )[0];
    expect(req.discount).toBe(747);
    const body = NubefactProvider.body(req) as Record<string, unknown> & {
      items: Record<string, unknown>[];
    };
    expect(body.total_descuento).toBe(747);
    expect(body.items[0]).toMatchObject({
      valor_unitario: 2490,
      descuento: 747,
      subtotal: 1743,
      precio_unitario: 2938.2,
    });
    expect(String(body.items[0].descripcion)).toContain(
      'Cupón FUNDADOR (−30 %)',
    );
  });

  it('C3: FUNDADOR en mensual se rechaza con el motivo', async () => {
    const r = await http()
      .get('/public/checkout/quote')
      .query({
        plan: 'crece',
        period: 'mensual',
        currency: 'PEN',
        coupon: 'FUNDADOR',
      })
      .expect(400);
    expect((r.body as { message: string }).message).toBe(
      'Este cupón es solo para pago trimestral o anual',
    );
    await buy('fundador-mensual@e2e.test', 'mensual', 'FUNDADOR').expect(400);
  });

  it('C2: el cupo 31 se rechaza con "Cupos agotados", también con compras a la vez', async () => {
    await coupons.updateOne({ code: 'FUNDADOR' }, { $set: { used: 29 } });
    const both = await Promise.all([
      buy('f30a@e2e.test', 'trimestral', 'FUNDADOR'),
      buy('f30b@e2e.test', 'trimestral', 'FUNDADOR'),
    ]);
    expect(both.map((r) => r.status).sort()).toEqual([201, 400]);
    const bad = both.find((r) => r.status === 400)!;
    expect((bad.body as { message: string }).message).toBe('Cupos agotados');
    expect((await coupons.findOne({ code: 'FUNDADOR' }).lean())!.used).toBe(30);
    expect(
      (
        (await http().get('/public/checkout/founder')).body as {
          remaining: number;
        }
      ).remaining,
    ).toBe(0);
  });

  it('el cupo se libera si el pago no se aprueba en 24 h', async () => {
    await coupons.updateOne({ code: 'FUNDADOR' }, { $set: { used: 10 } });
    const res = (
      await buy('f-libera@e2e.test', 'anual', 'FUNDADOR').expect(201)
    ).body as { session: string };
    expect((await coupons.findOne({ code: 'FUNDADOR' }).lean())!.used).toBe(11);
    await sessions.collection.updateOne(
      { publicId: res.session },
      { $set: { createdAt: new Date(Date.now() - 25 * 3600_000) } },
    );
    const svc = app.get(CouponsService);
    expect(await svc.releaseExpired()).toBe(1);
    expect(await svc.releaseExpired()).toBe(0);
    const used = async () =>
      (await coupons.findOne({ code: 'FUNDADOR' }).lean())!.used;
    expect(await used()).toBe(10);
    // El pago llega tarde: el cupo vuelve a contar una sola vez, aunque se repita el alta.
    const total = (await sessions.findOne({ publicId: res.session }).lean())!
      .total;
    await approve(res.session, total);
    await svc.reclaimSession(res.session);
    expect(await used()).toBe(11);
    const t = (await tenants.findOne({ email: 'f-libera@e2e.test' }).lean())!;
    expect(t.subscription!.discount!.code).toBe('FUNDADOR');
  });

  it('si Mercado Pago falla al abrir el pago, el cupo se libera una sola vez', async () => {
    await coupons.updateOne({ code: 'FUNDADOR' }, { $set: { used: 5 } });
    createPref.mockRejectedValueOnce(new Error('MP caído'));
    await buy('f-mpfalla@e2e.test', 'anual', 'FUNDADOR').expect(400);
    expect((await coupons.findOne({ code: 'FUNDADOR' }).lean())!.used).toBe(5);
    // La sesión fallida no queda: el cron no puede volver a liberarla.
    expect(
      await sessions.countDocuments({ 'buyer.email': 'f-mpfalla@e2e.test' }),
    ).toBe(0);
  });

  it('una compra nueva sin cupón quita el descuento anterior; la renovación lo conserva', async () => {
    const res = (
      await buy('f-sincupon@e2e.test', 'anual', 'FUNDADOR').expect(201)
    ).body as { session: string; total: number };
    await approve(res.session, res.total);
    const t = (await tenants.findOne({ email: 'f-sincupon@e2e.test' }).lean())!;
    expect(t.subscription!.discount!.code).toBe('FUNDADOR');
    const ts = app.get(TenantsService);
    await ts.activatePlan(t._id, {
      plan: 'crece',
      period: 'annual',
      currency: 'PEN',
      amount: 1743,
      renewal: true,
    });
    expect(
      (await tenants.findById(t._id).lean())!.subscription!.discount!.code,
    ).toBe('FUNDADOR');
    // Cambia a mensual pagando a precio de lista: FUNDADOR no sigue.
    await ts.activatePlan(t._id, {
      plan: 'crece',
      period: 'monthly',
      currency: 'PEN',
      amount: 249,
    });
    expect(
      (await tenants.findById(t._id).lean())!.subscription!.discount,
    ).toBeUndefined();
  });

  it('un cupón de una vez: la renovación ya va a precio de lista', async () => {
    await app.get(CouponsService).create({
      code: 'promo50',
      type: 'percent',
      value: 50,
      duration: 'once',
    });
    const res = (
      await buy('promo50@e2e.test', 'trimestral', 'PROMO50').expect(201)
    ).body as { session: string; total: number; subtotal: number };
    expect(res.subtotal).toBe(355);
    await approve(res.session, res.total);
    const t = (await tenants.findOne({ email: 'promo50@e2e.test' }).lean())!;
    expect(t.subscription!.amount).toBe(355);
    const end = new Date(t.subscription!.currentPeriodEnd!);
    expect(new Date(t.subscription!.discount!.endsAt!).getTime()).toBe(
      end.getTime(),
    );
    // Aviso de renovación 7 días antes: ya a precio de lista (710).
    createPref.mockClear();
    await app
      .get(SubscriptionLifecycleService)
      .sendRenewalNotices(new Date(end.getTime() - 6 * DAY));
    const item = (
      createPref.mock.calls.at(-1) as [{ items: { unit_price: number }[] }]
    )[0].items[0];
    expect(item.unit_price).toBe(837.8);
    // Y al terminar, el precio pactado vuelve al de lista.
    expect(
      await app
        .get(CouponsService)
        .expireDiscounts(new Date(end.getTime() + 1000)),
    ).toBe(1);
    const after = (await tenants.findById(t._id).lean())!;
    expect(after.subscription!.amount).toBe(710);
    expect(after.subscription!.discount).toBeUndefined();
  });

  it('el superadmin crea y edita cupones; un administrador de empresa no', async () => {
    const admin = await login(app, ADMIN.email, ADMIN.password);
    const owner = await registerTenant(app, 'Sin Cupones SAC');
    await http().get('/billing/admin/coupons').set(bearer(owner)).expect(403);
    const c = (
      await http()
        .post('/billing/admin/coupons')
        .set(bearer(admin))
        .send({
          code: 'verano',
          type: 'fixed',
          value: 20,
          currency: 'PEN',
          duration: 'months',
          durationMonths: 3,
          maxUses: 5,
        })
        .expect(201)
    ).body as { _id: string; code: string };
    expect(c.code).toBe('VERANO');
    await http()
      .post('/billing/admin/coupons')
      .set(bearer(admin))
      .send({ code: 'VERANO', type: 'percent', value: 10, duration: 'once' })
      .expect(409);
    await http()
      .post('/billing/admin/coupons')
      .set(bearer(admin))
      .send({ code: 'MALO', type: 'percent', value: 150, duration: 'once' })
      .expect(400);
    await http()
      .patch(`/billing/admin/coupons/${c._id}`)
      .set(bearer(admin))
      .send({ active: false })
      .expect(200);
    await http()
      .get('/public/checkout/quote')
      .query({
        plan: 'crece',
        period: 'anual',
        currency: 'PEN',
        coupon: 'VERANO',
      })
      .expect(400);
    const list = (
      await http().get('/billing/admin/coupons').set(bearer(admin)).expect(200)
    ).body as { code: string }[];
    expect(list.map((x) => x.code)).toEqual(
      expect.arrayContaining(['FUNDADOR', 'VERANO']),
    );
  });
});
