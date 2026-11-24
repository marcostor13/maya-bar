import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { ADMIN, bearer, createApp, login, registerTenant } from './support/app';
import {
  MercadoPagoClient,
  type MpPayment,
} from '../src/billing/mercadopago/mercadopago.client';
import { PaymentsService } from '../src/billing/payments.service';
import { MailService } from '../src/mail/mail.service';
import { NubefactProvider } from '../src/billing/invoicing/nubefact.provider';
import { InvoicingService } from '../src/billing/invoicing/invoicing.service';
import { BillingEmail } from '../src/billing/emails/billing-email.schema';
import { BillingNoticesService } from '../src/billing/emails/billing-notices.service';
import { Tenant } from '../src/tenants/tenant.schema';

const wait = (ms = 80) => new Promise((r) => setTimeout(r, ms));
let seq = 0;
const mpPay = (ref: string, extra: Partial<MpPayment> = {}): MpPayment => ({
  id: `mail-${++seq}`,
  status: 'approved',
  transaction_amount: 2938.2,
  currency_id: 'PEN',
  external_reference: ref,
  payment_type_id: 'credit_card',
  date_approved: new Date().toISOString(),
  ...extra,
});

/** HU50: correos de cobro. */
describe('Correos de cobro (HU50)', () => {
  let app: NestExpressApplication;
  let emails: Model<BillingEmail>;
  let sendHtml: jest.SpyInstance;
  const http = () => request(app.getHttpServer());

  const buy = async (email: string) =>
    (
      (
        await http()
          .post('/public/checkout')
          .send({
            plan: 'crece',
            period: 'anual',
            currency: 'PEN',
            buyer: { company: `Empresa ${email}`, name: 'Ana Pérez', email },
            billing: {
              docType: 'boleta',
              docNumber: '12345678',
              legalName: 'Ana Pérez',
            },
            acceptTerms: true,
          })
          .expect(201)
      ).body as { session: string }
    ).session;

  beforeAll(async () => {
    process.env.MP_ACCESS_TOKEN = 'TEST-token';
    app = await createApp();
    jest
      .spyOn(app.get(MercadoPagoClient), 'createPreference')
      .mockResolvedValue({ id: 'pref', init_point: 'https://mp.test/pref' });
    const nf = app.get(NubefactProvider);
    jest.spyOn(nf, 'configured').mockReturnValue(true);
    jest.spyOn(nf, 'find').mockResolvedValue(null);
    jest.spyOn(nf, 'issue').mockResolvedValue({
      pdfUrl: 'https://nf.test/b.pdf',
      xmlUrl: 'https://nf.test/b.xml',
    });
    sendHtml = jest
      .spyOn(app.get(MailService), 'sendHtml')
      .mockResolvedValue('mock');
    emails = app.get(getModelToken(BillingEmail.name));
  });
  afterAll(async () => {
    delete process.env.MP_ACCESS_TOKEN;
    await app.close();
  });

  const typesFor = async (to: string) =>
    (await emails.find({ to }).lean()).map((e) => e.type).sort();

  it('C1 + C2: cliente nuevo → exactamente bienvenida + comprobante; repetir el webhook no repite', async () => {
    const email = 'nuevo-mail@e2e.test';
    const session = await buy(email);
    const p = mpPay(session);
    const svc = app.get(PaymentsService);
    await svc.syncFromMp(p);
    await wait();
    await app.get(InvoicingService).drain();
    expect(await typesFor(email)).toEqual(['receipt', 'welcome']);

    sendHtml.mockClear();
    await svc.syncFromMp(p);
    await svc.syncFromMp(p);
    await wait();
    await app.get(InvoicingService).drain();
    expect(await typesFor(email)).toEqual(['receipt', 'welcome']);
    expect(
      sendHtml.mock.calls.filter(
        (c) => (c as [{ to: string }])[0].to === email,
      ),
    ).toHaveLength(0);

    const welcome = (await emails
      .findOne({ to: email, type: 'welcome' })
      .lean())!;
    expect(welcome.html).toContain('Crece');
    expect(welcome.html).toContain('S/ 2,938.20');
    expect(welcome.html).toContain('/acceso?token=[oculto]');
    expect(welcome.redacted).toBe(true);
  });

  it('el comprobante va al comprador y en copia al correo de facturación; si falla, se reintenta', async () => {
    const email = 'copia@e2e.test';
    const session = (
      (
        await http()
          .post('/public/checkout')
          .send({
            plan: 'crece',
            period: 'anual',
            currency: 'PEN',
            buyer: { company: 'Copia SAC', name: 'Ana', email },
            billing: {
              docType: 'boleta',
              docNumber: '12345678',
              legalName: 'Ana',
              email: 'conta@copia.test',
            },
            acceptTerms: true,
          })
          .expect(201)
      ).body as { session: string }
    ).session;
    sendHtml.mockClear();
    // El correo del comprobante falla una vez al primer destinatario.
    sendHtml.mockImplementation((m: { subject: string; to: string }) =>
      m.subject.includes('boleta') && m.to === 'conta@copia.test' && !failed++
        ? Promise.reject(new Error('caído'))
        : Promise.resolve('mock'),
    );
    let failed = 0;
    await app.get(PaymentsService).syncFromMp(mpPay(session));
    await wait();
    await app.get(InvoicingService).drain();
    await app.get(InvoicingService).drain();
    const receipt = (await emails
      .findOne({ type: 'receipt', to: email })
      .lean())!;
    expect(receipt.to.sort()).toEqual(['conta@copia.test', email]);
    expect(receipt.sentAt).toBeDefined();
    const byTo = (to: string) =>
      sendHtml.mock.calls.filter((c) => {
        const m = (c as [{ to: string; subject: string }])[0];
        return m.to === to && m.subject.includes('boleta');
      }).length;
    expect(byTo(email)).toBe(1); // no se repite al reintentar
    expect(byTo('conta@copia.test')).toBe(2); // el fallido y el reintento
    // La bienvenida (con el enlace) nunca va en copia.
    expect(
      (await emails.findOne({ type: 'welcome', to: email }).lean())!.to,
    ).toEqual([email]);
    sendHtml.mockReset();
    sendHtml.mockResolvedValue('mock');
  });

  it('cliente existente que paga desde su cuenta → "Pago confirmado" con "Ir a mi cuenta"', async () => {
    const owner = await registerTenant(app, 'Existente Mail');
    const session = (
      (
        await http()
          .post('/billing/checkout')
          .set(bearer(owner))
          .send({
            plan: 'crece',
            period: 'anual',
            currency: 'PEN',
            buyer: { company: 'Existente', name: 'Ana', email: owner.email },
            billing: {
              docType: 'boleta',
              docNumber: '12345678',
              legalName: 'Ana',
              email: 'conta@existente.test',
            },
            acceptTerms: true,
          })
          .expect(201)
      ).body as { session: string }
    ).session;
    await app.get(PaymentsService).syncFromMp(mpPay(session));
    const e = (await emails.findOne({ key: `paid:${session}` }).lean())!;
    expect(e.type).toBe('payment_confirmed');
    expect(e.html).toContain('/settings/plan');
  });

  it('PagoEfectivo pendiente → correo con el CIP y las instrucciones', async () => {
    const email = 'cip@e2e.test';
    const session = await buy(email);
    await app.get(PaymentsService).syncFromMp(
      mpPay(session, {
        status: 'pending',
        payment_type_id: 'ticket',
        transaction_details: {
          payment_method_reference_id: '98765432',
          external_resource_url: 'https://mp.test/ticket',
        },
      }),
    );
    const e = (await emails.findOne({ to: email, type: 'pending' }).lean())!;
    expect(e.html).toContain('98765432');
    expect(e.html).toContain('https://mp.test/ticket');
  });

  it('pago rechazado → motivo legible e "Intentar con otro medio" con el mismo plan', async () => {
    const email = 'rechazo@e2e.test';
    const session = await buy(email);
    await app.get(PaymentsService).syncFromMp(
      mpPay(session, {
        status: 'rejected',
        status_detail: 'cc_rejected_insufficient_amount',
      }),
    );
    const e = (await emails.findOne({ to: email, type: 'rejected' }).lean())!;
    expect(e.html).toContain('saldo suficiente');
    expect(e.html).toContain('/checkout?plan=crece&amp;periodo=anual');
  });

  it('prueba: aviso a los 4 días restantes, una sola vez', async () => {
    const owner = await registerTenant(app, 'Prueba Mail');
    await app
      .get<Model<Tenant>>(getModelToken(Tenant.name))
      .updateOne(
        { _id: owner.user.tenantId },
        { $set: { trialEndsAt: new Date(Date.now() + 4.5 * 86400_000) } },
      );
    const svc = app.get(BillingNoticesService);
    await svc.trialReminders();
    await svc.trialReminders();
    const sent = await emails
      .find({
        tenantId: new Types.ObjectId(owner.user.tenantId!),
        type: 'trial',
      })
      .lean();
    expect(sent).toHaveLength(1);
    expect(sent[0].key).toBe(`trial:${owner.user.tenantId}:4`);
  });

  it('créditos de IA: aviso al 80 % y al 100 %, una vez por umbral', async () => {
    const owner = await registerTenant(app, 'Creditos Mail');
    const svc = app.get(BillingNoticesService);
    const b = {
      period: '2026-11',
      unlimited: false,
      included: 500,
      usedFromPlan: 0,
      purchased: 0,
      remaining: 90,
    };
    await svc.onCredits(owner.user.tenantId!, b);
    await svc.onCredits(owner.user.tenantId!, b);
    await svc.onCredits(owner.user.tenantId!, { ...b, remaining: 0 });
    const keys = (
      await emails
        .find({
          tenantId: new Types.ObjectId(owner.user.tenantId!),
          type: 'ai_credits',
        })
        .lean()
    )
      .map((e) => e.key)
      .sort();
    expect(keys).toEqual([
      `credits:${owner.user.tenantId}:2026-11:100`,
      `credits:${owner.user.tenantId}:2026-11:80`,
    ]);
  });

  it('superadmin ve la bitácora y reenvía; otro rol no', async () => {
    const owner = await registerTenant(app, 'Bitacora');
    await http().get('/billing/admin/emails').set(bearer(owner)).expect(403);
    const admin = await login(app, ADMIN.email, ADMIN.password);
    const list = (
      await http().get('/billing/admin/emails').set(bearer(admin)).expect(200)
    ).body as { _id: string; html?: string }[];
    expect(list.length).toBeGreaterThan(0);
    expect(list[0].html).toBeUndefined();
    const welcome = await emails.findOne({ type: 'welcome' }).lean();
    await http()
      .post(`/billing/admin/emails/${String(welcome!._id)}/resend`)
      .set(bearer(admin))
      .expect(400);
    sendHtml.mockClear();
    await http()
      .post(`/billing/admin/emails/${list[0]._id}/resend`)
      .set(bearer(admin))
      .expect(201);
    expect(sendHtml).toHaveBeenCalled();
  });
});
