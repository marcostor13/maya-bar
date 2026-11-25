import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  createApp,
  login,
  ADMIN,
  bearer,
  registerTenant,
  type Session,
} from './support/app';
import {
  MercadoPagoClient,
  type MpPayment,
} from '../src/billing/mercadopago/mercadopago.client';
import { PaymentsService } from '../src/billing/payments.service';
import { MailService } from '../src/mail/mail.service';
import { Payment } from '../src/billing/payment.schema';
import { NubefactProvider } from '../src/billing/invoicing/nubefact.provider';
import { InvoicingService } from '../src/billing/invoicing/invoicing.service';

const wait = (ms = 80) => new Promise((r) => setTimeout(r, ms));
let seq = 0;
const mpPay = (ref: string): MpPayment => ({
  id: `sale-${++seq}`,
  status: 'approved',
  transaction_amount: 293.82,
  currency_id: 'PEN',
  external_reference: ref,
  payment_type_id: 'credit_card',
  date_approved: new Date().toISOString(),
});

type Mail = { to: string; subject: string; html: string };

/** HU75: aviso de cada venta y facturación manual. */
describe('Aviso de venta y facturación manual (HU75, e2e)', () => {
  let app: NestExpressApplication;
  let payments: Model<Payment>;
  let issue: jest.SpyInstance;
  let sendHtml: jest.SpyInstance;
  let admin: Session;
  const http = () => request(app.getHttpServer());
  const saleMails = () =>
    sendHtml.mock.calls
      .map((c) => (c as [Mail])[0])
      .filter((m) => m.subject.startsWith('Nueva venta'));

  const buy = async (email: string) =>
    (
      (
        await http()
          .post('/public/checkout')
          .send({
            plan: 'crece',
            period: 'mensual',
            currency: 'PEN',
            buyer: {
              company: `Empresa ${email}`,
              name: 'Ana Pérez',
              email,
              phone: '+51 999 111 222',
            },
            billing: {
              docType: 'factura',
              docNumber: '20123456786',
              legalName: 'Acme SAC',
              address: 'Av. Lima 123',
              email: 'conta@acme.test',
            },
            acceptTerms: true,
          })
          .expect(201)
      ).body as { session: string }
    ).session;

  beforeAll(async () => {
    process.env.MP_ACCESS_TOKEN = 'TEST-token';
    // Facturación manual: el valor por defecto en producción.
    process.env.INVOICING_AUTO = '';
    app = await createApp();
    jest
      .spyOn(app.get(MercadoPagoClient), 'createPreapproval')
      .mockResolvedValue({
        id: 'pre-sale',
        status: 'pending',
        init_point: 'https://mp.test/pre',
      });
    const nf = app.get(NubefactProvider);
    jest.spyOn(nf, 'configured').mockReturnValue(true);
    issue = jest.spyOn(nf, 'issue');
    sendHtml = jest
      .spyOn(app.get(MailService), 'sendHtml')
      .mockResolvedValue('mock');
    payments = app.get(getModelToken(Payment.name));
    admin = await login(app, ADMIN.email, ADMIN.password);
  });

  afterAll(async () => {
    delete process.env.MP_ACCESS_TOKEN;
    process.env.INVOICING_AUTO = 'true';
    await app.close();
  });

  it('C1 + C2 + C3: un pago aprobado avisa una sola vez a admin@ignia.site y queda por facturar a mano', async () => {
    const session = await buy('venta@e2e.test');
    sendHtml.mockClear();
    const p = mpPay(session);
    await app.get(PaymentsService).syncFromMp(p);
    await wait();
    // Mercado Pago reenvía el mismo aviso.
    await app.get(PaymentsService).syncFromMp(p);
    await wait();
    await app.get(InvoicingService).drain();

    const mails = saleMails();
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe('admin@ignia.site');
    expect(mails[0].html).toContain('Plan Crece');
    expect(mails[0].html).toContain(String(p.id));
    expect(mails[0].html).toContain('20123456786');
    expect(mails[0].html).toContain('Acme SAC');
    expect(mails[0].html).toContain('Facturación manual');

    const saved = (await payments
      .findOne({ providerPaymentId: String(p.id) })
      .lean())!;
    expect(saved.receipt?.status).toBe('manual');
    expect(issue).not.toHaveBeenCalled();
  });

  it('un pago por facturar que se reembolsa sale de "Por facturar"', async () => {
    const session = await buy('reembolso@e2e.test');
    const p = mpPay(session);
    await app.get(PaymentsService).syncFromMp(p);
    await wait();
    await app.get(PaymentsService).syncFromMp({ ...p, status: 'refunded' });
    await wait();
    const saved = (await payments
      .findOne({ providerPaymentId: String(p.id) })
      .lean())!;
    expect(saved.receipt).toMatchObject({
      status: 'skipped',
      skippedReason: 'Reembolsado antes de facturar',
    });
    expect(issue).not.toHaveBeenCalled();
  });

  it('C5: el superadmin lista lo por facturar y lo marca; nadie más puede', async () => {
    const session = await buy('marcar@e2e.test');
    const p = mpPay(session);
    await app.get(PaymentsService).syncFromMp(p);
    await wait();
    const saved = (await payments
      .findOne({ providerPaymentId: String(p.id) })
      .lean())!;
    const id = String(saved._id);

    const list = await http()
      .get('/billing/admin/receipts?status=manual')
      .set(bearer(admin))
      .expect(200);
    expect((list.body as { _id: string }[]).map((x) => x._id)).toContain(id);

    const owner = await registerTenant(app, 'Ajena HU75');
    await http()
      .post(`/billing/admin/receipts/${id}/invoiced`)
      .set(bearer(owner))
      .send({})
      .expect(403);

    await http()
      .post(`/billing/admin/receipts/${id}/invoiced`)
      .set(bearer(admin))
      .send({ reference: 'B001-15' })
      .expect(201);
    const after = (await payments.findById(id).lean())!;
    expect(after.receipt).toMatchObject({
      status: 'skipped',
      skippedReason: 'Facturado a mano: B001-15',
    });

    const again = await http()
      .get('/billing/admin/receipts?status=manual')
      .set(bearer(admin))
      .expect(200);
    expect((again.body as { _id: string }[]).map((x) => x._id)).not.toContain(
      id,
    );
    await http()
      .post(`/billing/admin/receipts/${id}/invoiced`)
      .set(bearer(admin))
      .send({})
      .expect(400);
  });
});
