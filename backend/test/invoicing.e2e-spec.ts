import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { CheckoutSession } from '../src/billing/checkout-session.schema';
import { createApp, login, ADMIN, bearer, registerTenant } from './support/app';
import {
  MercadoPagoClient,
  type MpPayment,
} from '../src/billing/mercadopago/mercadopago.client';
import { PaymentsService } from '../src/billing/payments.service';
import { MailService } from '../src/mail/mail.service';
import { Payment } from '../src/billing/payment.schema';
import { Tenant } from '../src/tenants/tenant.schema';
import { NubefactProvider } from '../src/billing/invoicing/nubefact.provider';
import { InvoicingService } from '../src/billing/invoicing/invoicing.service';
import type { InvoiceRequest } from '../src/billing/invoicing/invoice-provider';

const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));
let seq = 0;
const mpPay = (ref: string, extra: Partial<MpPayment> = {}): MpPayment => ({
  id: `inv-${++seq}`,
  status: 'approved',
  transaction_amount: 293.82,
  currency_id: 'PEN',
  external_reference: ref,
  payment_type_id: 'credit_card',
  date_approved: new Date().toISOString(),
  ...extra,
});

/** HU49: comprobante electrónico SUNAT con Nubefact simulado. */
describe('Comprobante SUNAT (HU49)', () => {
  let app: NestExpressApplication;
  let payments: Model<Payment>;
  let issue: jest.SpyInstance;
  let sendHtml: jest.SpyInstance;
  const http = () => request(app.getHttpServer());

  const buy = async (email: string, billing: object) =>
    (
      (
        await http()
          .post('/public/checkout')
          .send({
            plan: 'crece',
            period: 'mensual',
            currency: 'PEN',
            buyer: { company: `Empresa ${email}`, name: 'Ana Pérez', email },
            billing,
            acceptTerms: true,
          })
          .expect(201)
      ).body as { session: string }
    ).session;

  beforeAll(async () => {
    process.env.MP_ACCESS_TOKEN = 'TEST-token';
    app = await createApp();
    jest
      .spyOn(app.get(MercadoPagoClient), 'createPreapproval')
      .mockResolvedValue({
        id: 'pre-inv',
        status: 'pending',
        init_point: 'https://mp.test/pre',
      });
    const nf = app.get(NubefactProvider);
    jest.spyOn(nf, 'configured').mockReturnValue(true);
    jest.spyOn(nf, 'find').mockResolvedValue(null);
    issue = jest.spyOn(nf, 'issue').mockImplementation((r: InvoiceRequest) =>
      Promise.resolve({
        pdfUrl: `https://nf.test/${r.series}-${r.number}.pdf`,
        xmlUrl: `https://nf.test/${r.series}-${r.number}.xml`,
        acceptedBySunat: true,
      }),
    );
    sendHtml = jest
      .spyOn(app.get(MailService), 'sendHtml')
      .mockResolvedValue('mock');
    payments = app.get(getModelToken(Payment.name));
  });
  afterAll(async () => {
    delete process.env.MP_ACCESS_TOKEN;
    await app.close();
  });

  it('C1 + C2: S/ 293,82 con RUC → factura con base 249,00, IGV 44,82 y total 293,82, enviada por correo', async () => {
    const session = await buy('factura@e2e.test', {
      docType: 'factura',
      docNumber: '20123456786',
      legalName: 'Acme SAC',
      address: 'Av. Lima 123',
      email: 'conta@acme.test',
    });
    issue.mockClear();
    sendHtml.mockClear();
    const p = mpPay(session);
    await app.get(PaymentsService).syncFromMp(p);
    await wait();
    await app.get(InvoicingService).drain();

    expect(issue).toHaveBeenCalledTimes(1);
    const [req] = issue.mock.calls[0] as [InvoiceRequest];
    expect(req).toMatchObject({
      type: '01',
      series: 'F001',
      base: 249,
      igv: 44.82,
      total: 293.82,
      customer: { docType: '6', docNumber: '20123456786', name: 'Acme SAC' },
    });
    expect(req.description).toMatch(
      /^Suscripción Maya CRM — Plan Crece \(mensual\) \d\d\/\d\d–\d\d\/\d\d$/,
    );
    const saved = (await payments.findOne({ providerPaymentId: p.id }).lean())!;
    expect(saved.receipt).toMatchObject({
      status: 'issued',
      type: '01',
      series: 'F001',
    });
    expect(saved.receipt!.pdfUrl).toContain('.pdf');

    const mail = sendHtml.mock.calls.find(
      (c) => (c as [{ to: string }])[0].to === 'conta@acme.test',
    ) as [{ subject: string; html: string }];
    expect(mail[0].subject).toContain('factura');
    expect(mail[0].html).toContain('.pdf');
    expect(mail[0].html).toContain('.xml');

    // Cuerpo real de Nubefact con esos importes.
    const body = NubefactProvider.body(req);
    expect(body).toMatchObject({
      tipo_de_comprobante: 1,
      total_gravada: 249,
      total_igv: 44.82,
      total: 293.82,
      cliente_tipo_de_documento: '6',
    });
  });

  it('C3: un reembolso genera una nota de crédito ligada a la factura original', async () => {
    const session = await buy('reembolso@e2e.test', {
      docType: 'factura',
      docNumber: '20123456786',
      legalName: 'Acme SAC',
      address: 'Lima',
    });
    const p = mpPay(session);
    const svc = app.get(PaymentsService);
    await svc.syncFromMp(p);
    await wait();
    await app.get(InvoicingService).drain();
    const original = (await payments
      .findOne({ providerPaymentId: p.id })
      .lean())!.receipt!;
    issue.mockClear();
    await svc.syncFromMp({ ...p, status: 'refunded' });
    await wait();
    await app.get(InvoicingService).drain();
    const [nc] = issue.mock.calls[0] as [InvoiceRequest];
    expect(nc).toMatchObject({
      type: '07',
      series: 'FC01',
      refersTo: {
        type: '01',
        series: original.series,
        number: original.number,
      },
    });
    expect(
      (await payments.findOne({ providerPaymentId: p.id }).lean())!.receipt!
        .creditNote,
    ).toMatchObject({ status: 'issued' });
  });

  it('C4: si Nubefact cae, el pago y el acceso siguen y el comprobante sale al reintentar (mismo número)', async () => {
    const email = 'caida@e2e.test';
    const session = await buy(email, {
      docType: 'boleta',
      docNumber: '12345678',
      legalName: 'Ana Pérez',
    });
    issue.mockClear();
    issue.mockRejectedValueOnce(new Error('Nubefact 503'));
    const p = mpPay(session);
    await app.get(PaymentsService).syncFromMp(p);
    await wait();
    const tenant = (await app
      .get<Model<Tenant>>(getModelToken(Tenant.name))
      .findOne({ email })
      .lean())!;
    expect(tenant.subscription!.status).toBe('active');
    const after1 = (await payments.findOne({ providerPaymentId: p.id }).lean())!
      .receipt!;
    expect(after1).toMatchObject({
      status: 'pending',
      attempts: 1,
      type: '03',
      series: 'B001',
    });

    await payments.updateOne(
      { providerPaymentId: p.id },
      { $set: { 'receipt.nextAttemptAt': new Date(0) } },
    );
    await app.get(InvoicingService).drain();
    const after2 = (await payments.findOne({ providerPaymentId: p.id }).lean())!
      .receipt!;
    expect(after2.status).toBe('issued');
    expect(after2.number).toBe(after1.number);
    const [last] = issue.mock.calls.at(-1) as [InvoiceRequest];
    expect(last.customer).toMatchObject({
      docType: '1',
      docNumber: '12345678',
    });
  });

  it('cola del superadmin: los fallidos se ven y se reintentan; otro rol no entra', async () => {
    const session = await buy('fallida@e2e.test', {
      docType: 'boleta',
      docNumber: '12345678',
      legalName: 'Ana',
    });
    const p = mpPay(session);
    issue.mockRejectedValue(new Error('Nubefact caído'));
    await app.get(PaymentsService).syncFromMp(p);
    await wait();
    await payments.updateOne(
      { providerPaymentId: p.id },
      { $set: { 'receipt.attempts': 7, 'receipt.nextAttemptAt': new Date(0) } },
    );
    await app.get(InvoicingService).drain();
    expect(
      (await payments.findOne({ providerPaymentId: p.id }).lean())!.receipt!
        .status,
    ).toBe('failed');
    issue.mockReset();
    issue.mockResolvedValue({
      pdfUrl: 'https://nf.test/x.pdf',
      xmlUrl: 'https://nf.test/x.xml',
    });

    const admin = await login(app, ADMIN.email, ADMIN.password);
    const q = (
      await http().get('/billing/admin/receipts').set(bearer(admin)).expect(200)
    ).body as { providerPaymentId: string }[];
    expect(q.some((x) => x.providerPaymentId === p.id)).toBe(true);
    const id = String(
      (await payments.findOne({ providerPaymentId: p.id }).lean())!._id,
    );
    await http()
      .post(`/billing/admin/receipts/${id}/retry`)
      .set(bearer(admin))
      .expect(201);
    expect(
      (await payments.findOne({ providerPaymentId: p.id }).lean())!.receipt!
        .status,
    ).toBe('issued');
  });

  it('pago en dólares: sin comprobante SUNAT por defecto (solo recibo)', async () => {
    const session = await buy('usd@e2e.test', {
      docType: 'boleta',
      docNumber: '12345678',
      legalName: 'Ana',
    });
    const p = mpPay(session, { currency_id: 'USD', transaction_amount: 79 });
    await app.get(PaymentsService).syncFromMp(p);
    await wait();
    await app.get(InvoicingService).drain();
    expect(
      (await payments.findOne({ providerPaymentId: p.id }).lean())!.receipt,
    ).toMatchObject({ status: 'skipped' });
  });

  it('H1: reembolsado antes de emitir → no se factura', async () => {
    const session = await buy('antes@e2e.test', {
      docType: 'boleta',
      docNumber: '12345678',
      legalName: 'Ana',
    });
    const nf = app.get(NubefactProvider);
    const cfg = jest.spyOn(nf, 'configured').mockReturnValue(false);
    const p = mpPay(session);
    const svc = app.get(PaymentsService);
    await svc.syncFromMp(p);
    await wait();
    await svc.syncFromMp({ ...p, status: 'refunded' });
    cfg.mockReturnValue(true);
    issue.mockClear();
    await payments.updateOne(
      { providerPaymentId: p.id },
      { $unset: { 'receipt.nextAttemptAt': '' } },
    );
    await app.get(InvoicingService).drain();
    expect(issue).not.toHaveBeenCalled();
    expect(
      (await payments.findOne({ providerPaymentId: p.id }).lean())!.receipt,
    ).toMatchObject({ status: 'skipped' });
  });

  it('boleta sin documento: sí bajo S/ 700, no desde S/ 700', async () => {
    const svc = app.get(PaymentsService);
    issue.mockClear();
    const s1 = await buy('sindoc1@e2e.test', {
      docType: 'boleta',
      docNumber: '12345678',
      legalName: 'Ana',
    });
    // Simula datos sin DNI (renovación de una cuenta sin facturación).
    const ref1 = s1;
    await app
      .get<Model<CheckoutSession>>(getModelToken(CheckoutSession.name))
      .updateOne({ publicId: ref1 }, { $set: { 'billing.docNumber': '' } });
    const p1 = mpPay(ref1, { transaction_amount: 116.82 });
    await svc.syncFromMp(p1);
    await wait();
    await app.get(InvoicingService).drain();
    const [r1] = issue.mock.calls.at(-1) as [InvoiceRequest];
    expect(r1.customer).toMatchObject({ docType: '-', docNumber: '-' });

    const s2 = await buy('sindoc2@e2e.test', {
      docType: 'boleta',
      docNumber: '12345678',
      legalName: 'Ana',
    });
    await app
      .get<Model<CheckoutSession>>(getModelToken(CheckoutSession.name))
      .updateOne({ publicId: s2 }, { $set: { 'billing.docNumber': '' } });
    const p2 = mpPay(s2, { transaction_amount: 700 });
    await svc.syncFromMp(p2);
    await wait();
    expect(
      (await payments.findOne({ providerPaymentId: p2.id }).lean())!.receipt!
        .error,
    ).toContain('700');
  });

  it('R5: modo export → exportación sin IGV en el cuerpo de Nubefact', () => {
    const body = NubefactProvider.body({
      type: '01',
      series: 'F001',
      number: 9,
      issueDate: new Date('2026-11-24T03:00:00Z'),
      currency: 'USD',
      customer: { docType: '6', docNumber: '20123456786', name: 'Acme' },
      base: 79,
      igv: 0,
      total: 79,
      export: true,
      description: 'x',
    });
    expect(body).toMatchObject({
      sunat_transaction: 2,
      total_exportacion: 79,
      total_igv: 0,
      moneda: 2,
    });
    expect((body.items as { tipo_de_igv: number }[])[0].tipo_de_igv).toBe(16);
    // 03:00 UTC del 24 = 22:00 del 23 en Lima (H2).
    expect(body.fecha_de_emision).toBe('23-11-2026');
  });

  it('H3/H5: la cola es solo del superadmin y el reintento solo vale para fallidos', async () => {
    const owner = await registerTenant(app, 'No Admin');
    await http().get('/billing/admin/receipts').set(bearer(owner)).expect(403);
    const admin = await login(app, ADMIN.email, ADMIN.password);
    const issued = (await payments
      .findOne({ 'receipt.status': 'issued' })
      .lean())!;
    await http()
      .post(`/billing/admin/receipts/${String(issued._id)}/retry`)
      .set(bearer(admin))
      .expect(400);
  });

  it('H6: el historial del cliente no expone la cola interna', async () => {
    const owner = await registerTenant(app, 'Historial');
    await payments.create({
      tenantId: new Types.ObjectId(owner.user.tenantId!),
      concept: 'Plan',
      amount: 116.82,
      status: 'approved',
      paidAt: new Date(),
      receipt: {
        status: 'issued',
        series: 'B001',
        number: 7,
        pdfUrl: 'https://nf.test/b.pdf',
        error: 'interno',
        attempts: 3,
      },
    });
    const res = await http()
      .get('/billing/payments')
      .set(bearer(owner))
      .expect(200);
    const text = JSON.stringify(res.body);
    expect(text).toContain('b.pdf');
    expect(text).not.toContain('interno');
    expect(text).not.toContain('attempts');
  });
});
