import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import {
  ADMIN,
  bearer,
  createApp,
  login,
  registerTenant,
  type Session,
} from './support/app';
import {
  MercadoPagoClient,
  type MpPayment,
} from '../src/billing/mercadopago/mercadopago.client';
import { PaymentsService } from '../src/billing/payments.service';
import { MailService } from '../src/mail/mail.service';
import { NubefactProvider } from '../src/billing/invoicing/nubefact.provider';
import { InvoicingService } from '../src/billing/invoicing/invoicing.service';
import type { InvoiceRequest } from '../src/billing/invoicing/invoice-provider';
import { Tenant } from '../src/tenants/tenant.schema';

const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));

interface Detail {
  tenant: {
    plan: string;
    trialEndsAt?: string;
    subscription: { status: string; period?: string; amount?: number } | null;
  };
  payments: {
    _id: string;
    amount: number;
    status: string;
    provider: string;
    receipt?: {
      status: string;
      code?: string;
      creditNote?: { status: string; code?: string };
    };
  }[];
  actions: { action: string; actorEmail: string }[];
}

/** HU57: panel de suscripciones e ingresos del superadmin. */
describe('Suscripciones e ingresos (HU57)', () => {
  let app: NestExpressApplication;
  let admin: Session;
  let issue: jest.SpyInstance;
  const http = () => request(app.getHttpServer());
  const api = '/billing/admin/subscriptions';
  const detail = async (id: string) =>
    (await http().get(`${api}/${id}`).set(bearer(admin)).expect(200))
      .body as Detail;

  beforeAll(async () => {
    process.env.MP_ACCESS_TOKEN = 'TEST-token';
    app = await createApp();
    jest.spyOn(app.get(MailService), 'sendHtml').mockResolvedValue('mock');
    const nf = app.get(NubefactProvider);
    jest.spyOn(nf, 'configured').mockReturnValue(true);
    jest.spyOn(nf, 'find').mockResolvedValue(null);
    issue = jest.spyOn(nf, 'issue').mockResolvedValue({
      pdfUrl: 'https://nf.test/a.pdf',
      xmlUrl: 'https://nf.test/a.xml',
    });
    admin = await login(app, ADMIN.email, ADMIN.password);
  });
  afterAll(async () => {
    delete process.env.MP_ACCESS_TOKEN;
    await app.close();
  });

  it('solo el superadmin entra', async () => {
    const owner = await registerTenant(app, 'Curiosa');
    await http().get(`${api}/summary`).set(bearer(owner)).expect(403);
  });

  it('HU87: ya no existe alargar la prueba', async () => {
    const owner = await registerTenant(app, 'Sin prueba');
    await http()
      .post(`${api}/${owner.user.tenantId}/extend-trial`)
      .set(bearer(admin))
      .send({ days: 7 })
      .expect(404);
  });

  it('C2: el pago manual activa la suscripción y emite el comprobante', async () => {
    const owner = await registerTenant(app, 'Transferencia');
    const id = owner.user.tenantId!;
    await app.get<Model<Tenant>>(getModelToken(Tenant.name)).updateOne(
      { _id: id },
      {
        $set: {
          billingInfo: {
            docType: 'boleta',
            docNumber: '12345678',
            legalName: 'Ana Pérez',
          },
        },
      },
    );
    // Sin plan pagado no se puede poner precio especial.
    await http()
      .post(`${api}/${id}/change-plan`)
      .set(bearer(admin))
      .send({ plan: 'crece', amount: 199 })
      .expect(400);

    issue.mockClear();
    await http()
      .post(`${api}/${id}/manual-payment`)
      .set(bearer(admin))
      .send({
        plan: 'crece',
        period: 'quarterly',
        currency: 'PEN',
        total: 837.8,
        method: 'yape',
        reference: 'OP-123',
      })
      .expect(201);
    await wait();
    await app.get(InvoicingService).drain();
    const d = await detail(id);
    expect(d.tenant.plan).toBe('crece');
    expect(d.tenant.subscription).toMatchObject({
      status: 'active',
      period: 'quarterly',
      amount: 710,
    });
    expect(d.payments[0]).toMatchObject({
      amount: 837.8,
      status: 'approved',
      provider: 'manual',
    });
    expect(d.payments[0].receipt).toMatchObject({ status: 'issued' });
    const req = (issue.mock.calls.at(-1) as [InvoiceRequest])[0];
    expect(req).toMatchObject({ total: 837.8, base: 710, type: '03' });
    expect(req.description).toContain('Plan Crece (trimestral)');
    expect(d.actions[0]).toMatchObject({ action: 'manual_payment' });

    // Precio especial: cambia el plan y el monto pactado, sin mover el periodo.
    await http()
      .post(`${api}/${id}/change-plan`)
      .set(bearer(admin))
      .send({ plan: 'escala', amount: 1200, reason: 'Acuerdo comercial' })
      .expect(201);
    const d2 = await detail(id);
    expect(d2.tenant.plan).toBe('escala');
    expect(d2.tenant.subscription).toMatchObject({
      status: 'active',
      period: 'quarterly',
      amount: 1200,
    });

    // El reembolso de un pago manual genera la nota de crédito.
    issue.mockClear();
    await http()
      .post(`${api}/payments/${d.payments[0]._id}/refund`)
      .set(bearer(admin))
      .send({ reason: 'Error' })
      .expect(201);
    await wait();
    await app.get(InvoicingService).drain();
    const d3 = await detail(id);
    expect(d3.payments[0].status).toBe('refunded');
    expect(d3.payments[0].receipt?.creditNote).toMatchObject({
      status: 'issued',
    });
    expect((issue.mock.calls.at(-1) as [InvoiceRequest])[0].type).toBe('07');
  });

  it('C3: el reembolso de un pago de Mercado Pago llama a la API y genera la nota de crédito', async () => {
    const owner = await registerTenant(app, 'Reembolso MP');
    const id = owner.user.tenantId!;
    await app.get<Model<Tenant>>(getModelToken(Tenant.name)).updateOne(
      { _id: id },
      {
        $set: {
          billingInfo: {
            docType: 'boleta',
            docNumber: '87654321',
            legalName: 'Luis',
          },
        },
      },
    );
    const mp = app.get(MercadoPagoClient);
    const mpPay: MpPayment = {
      id: 'mp-refund-1',
      status: 'approved',
      transaction_amount: 116.82,
      currency_id: 'PEN',
      payment_type_id: 'credit_card',
      date_approved: new Date().toISOString(),
      metadata: { tenant_id: id, plan: 'inicia', period: 'monthly' },
    };
    await app.get(PaymentsService).syncFromMp(mpPay);
    await wait();
    await app.get(InvoicingService).drain();
    const before = await detail(id);
    expect(before.payments[0].receipt?.status).toBe('issued');

    const refund = jest.spyOn(mp, 'refundPayment').mockResolvedValue({ id: 1 });
    jest
      .spyOn(mp, 'getPayment')
      .mockResolvedValue({ ...mpPay, status: 'refunded' });
    issue.mockClear();
    await http()
      .post(`${api}/payments/${before.payments[0]._id}/refund`)
      .set(bearer(admin))
      .send({})
      .expect(201);
    expect(refund).toHaveBeenCalledWith('mp-refund-1');
    await wait();
    await app.get(InvoicingService).drain();
    const after = await detail(id);
    expect(after.payments[0].status).toBe('refunded');
    expect(after.payments[0].receipt?.creditNote?.status).toBe('issued');
    // Un segundo reembolso no se acepta.
    await http()
      .post(`${api}/payments/${before.payments[0]._id}/refund`)
      .set(bearer(admin))
      .send({})
      .expect(400);
  });

  it('resumen: MRR normalizado, sin KPIs de prueba, lista con filtros y reenvío de comprobante', async () => {
    const s = (
      await http().get(`${api}/summary`).set(bearer(admin)).expect(200)
    ).body as {
      mrr: { PEN: number };
      active: number;
      trials?: number;
      byPlan: { plan: string }[];
    };
    // La cuenta con Escala trimestral a 1.200 aporta 400 al mes.
    expect(s.mrr.PEN).toBeGreaterThanOrEqual(400);
    expect(s.active).toBeGreaterThanOrEqual(1);
    expect(s.trials).toBeUndefined();
    expect(s.byPlan.some((p) => p.plan === 'escala')).toBe(true);

    const list = (
      await http()
        .get(api)
        .query({ status: 'active', period: 'quarterly' })
        .set(bearer(admin))
        .expect(200)
    ).body as { rows: { _id: string; status: string; period: string }[] };
    expect(list.rows.length).toBeGreaterThanOrEqual(1);
    expect(
      list.rows.every((r) => r.status === 'active' && r.period === 'quarterly'),
    ).toBe(true);
    const d = await detail(list.rows[0]._id);
    await http()
      .post(`${api}/payments/${d.payments[0]._id}/resend-receipt`)
      .set(bearer(admin))
      .send({ kind: 'receipt' })
      .expect(201);
    await http()
      .post(`${api}/${list.rows[0]._id}/resend-access`)
      .set(bearer(admin))
      .expect(400);
  });

  const tenantModel = () => app.get<Model<Tenant>>(getModelToken(Tenant.name));
  const manual = (id: string, body: Record<string, unknown>) =>
    http()
      .post(`${api}/${id}/manual-payment`)
      .set(bearer(admin))
      .send({ currency: 'PEN', method: 'transfer', ...body });

  it('pago manual idempotente y a un plan menor: se aplica ya con el monto pagado', async () => {
    const owner = await registerTenant(app, 'Baja Manual');
    const id = owner.user.tenantId!;
    const requestId = 'req-1234-abcd';
    await manual(id, {
      plan: 'escala',
      period: 'annual',
      total: 6478.2,
      requestId,
    }).expect(201);
    const dup = (
      await manual(id, {
        plan: 'escala',
        period: 'annual',
        total: 6478.2,
        requestId,
      }).expect(201)
    ).body as { duplicate?: boolean };
    expect(dup.duplicate).toBe(true);
    let d = await detail(id);
    expect(d.payments.filter((p) => p.provider === 'manual')).toHaveLength(1);
    const end1 = (await tenantModel().findById(id).lean())!.subscription!
      .currentPeriodEnd!;

    // Activa en Escala anual, paga a mano Crece mensual: entra Crece ya, a 249.
    await manual(id, {
      plan: 'crece',
      period: 'monthly',
      total: 293.82,
    }).expect(201);
    d = await detail(id);
    expect(d.tenant.plan).toBe('crece');
    expect(d.tenant.subscription).toMatchObject({
      period: 'monthly',
      amount: 249,
    });
    const t = (await tenantModel().findById(id).lean())!;
    expect(t.subscription?.pendingPlan).toBeUndefined();
    // Renovación adelantada: el periodo nuevo empieza al vencer el anterior.
    const meta = (await app
      .get<Model<{ metadata?: Record<string, unknown> }>>(
        getModelToken('Payment'),
      )
      .findOne({ tenantId: new Types.ObjectId(id), 'metadata.plan': 'crece' })
      .lean())!.metadata!;
    expect(new Date(meta.periodFrom as string).getTime()).toBe(
      new Date(end1).getTime(),
    );
    const s = (
      await http().get(`${api}/summary`).set(bearer(admin)).expect(200)
    ).body as { byPlan: { plan: string; mrr: { PEN: number } }[] };
    expect(
      s.byPlan.find((p) => p.plan === 'escala')?.mrr.PEN ?? 0,
    ).toBeLessThan(1000);
    await http()
      .post(`${api}/${id}/change-plan`)
      .set(bearer(admin))
      .send({ plan: 'crece', amount: 0 })
      .expect(400);
  });

  it('reembolso: un segundo pedido simultáneo da 409; si Mercado Pago no responde el estado, queda reembolsado igual', async () => {
    const owner = await registerTenant(app, 'Reembolso Doble');
    const id = owner.user.tenantId!;
    const mp = app.get(MercadoPagoClient);
    const mpPay: MpPayment = {
      id: 'mp-refund-2',
      status: 'approved',
      transaction_amount: 116.82,
      currency_id: 'PEN',
      payment_type_id: 'credit_card',
      date_approved: new Date().toISOString(),
      metadata: { tenant_id: id, plan: 'inicia', period: 'monthly' },
    };
    await app.get(PaymentsService).syncFromMp(mpPay);
    const [pay] = (await detail(id)).payments;
    let release!: () => void;
    const refund = jest.spyOn(mp, 'refundPayment').mockImplementation(
      () =>
        new Promise((r) => {
          release = () => r({ id: 2 });
        }),
    );
    refund.mockClear();
    jest.spyOn(mp, 'getPayment').mockRejectedValue(new Error('timeout'));
    const first = http()
      .post(`${api}/payments/${pay._id}/refund`)
      .set(bearer(admin))
      .send({ reason: 'a' })
      .then((r) => r);
    await wait(100);
    await http()
      .post(`${api}/payments/${pay._id}/refund`)
      .set(bearer(admin))
      .send({ reason: 'b' })
      .expect(409);
    release();
    expect((await first).status).toBe(201);
    expect(refund).toHaveBeenCalledTimes(1);
    expect((await detail(id)).payments[0].status).toBe('refunded');
    refund.mockRestore();
  });

  it('churn: una cancelación pedida al vencer no es baja; una cancelada y una caída por impago sí', async () => {
    const before = (
      await http().get(`${api}/summary`).set(bearer(admin)).expect(200)
    ).body as {
      canceledThisMonth: number;
      cancelScheduled: number;
      pastDue: number;
    };
    const mk = async (name: string, sub: Record<string, unknown>) => {
      const o = await registerTenant(app, name);
      await tenantModel().updateOne(
        { _id: o.user.tenantId },
        {
          $set: {
            subscription: {
              period: 'monthly',
              currency: 'PEN',
              amount: 99,
              ...sub,
            },
          },
        },
      );
    };
    const now = Date.now();
    await mk('Pide baja', {
      status: 'active',
      cancelAtPeriodEnd: true,
      canceledAt: new Date(),
    });
    await mk('Se fue', { status: 'canceled', canceledAt: new Date() });
    await mk('Impago vencido', {
      status: 'past_due',
      graceEndsAt: new Date(now - 3600_000),
    });
    await mk('Impago vigente', {
      status: 'past_due',
      graceEndsAt: new Date(now + 3 * 86400_000),
    });
    const s = (
      await http().get(`${api}/summary`).set(bearer(admin)).expect(200)
    ).body as typeof before;
    expect(s.canceledThisMonth - before.canceledThisMonth).toBe(
      new Date().getDate() === 1 &&
        new Date(now - 3600_000).getMonth() !== new Date().getMonth()
        ? 1
        : 2,
    );
    expect(s.cancelScheduled - before.cancelScheduled).toBe(1);
    expect(s.pastDue - before.pastDue).toBe(1);
  });
});
