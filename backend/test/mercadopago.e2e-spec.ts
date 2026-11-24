import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { createApp } from './support/app';
import {
  MercadoPagoClient,
  type MpPayment,
} from '../src/billing/mercadopago/mercadopago.client';
import { Payment } from '../src/billing/payment.schema';
import { BillingEvent } from '../src/billing/billing-event.schema';
import { BillingEventsService } from '../src/billing/billing-events.service';
import { PaymentsService } from '../src/billing/payments.service';
import { BillingHooks } from '../src/billing/billing-hooks.service';
import { signMp } from '../src/billing/mercadopago/mp-signature';

const SECRET = 'e2e-mp-secret';
const tenantId = new Types.ObjectId().toHexString();

function mpPayment(
  id: string,
  status: string,
  extra: Partial<MpPayment> = {},
): MpPayment {
  return {
    id,
    status,
    transaction_amount: 116.82,
    currency_id: 'PEN',
    description: 'Plan Inicia mensual',
    metadata: { tenant_id: tenantId, kind: 'plan' },
    date_created: new Date().toISOString(),
    date_approved: status === 'approved' ? new Date().toISOString() : null,
    ...extra,
  };
}

/** Espera a que el procesamiento asíncrono del webhook termine. */
async function until(check: () => Promise<boolean>, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('Tiempo agotado esperando el procesamiento');
}

/** HU45: webhook de Mercado Pago con la API simulada. */
describe('Mercado Pago (HU45)', () => {
  let app: NestExpressApplication;
  let payments: Model<Payment>;
  let events: Model<BillingEvent>;
  let getPayment: jest.SpyInstance;
  const hookCalls: string[] = [];
  const http = () => request(app.getHttpServer());

  const send = (
    dataId: string,
    opts: { eventId?: string; signature?: string } = {},
  ) =>
    http()
      .post(`/billing/webhooks/mercadopago?data.id=${dataId}&type=payment`)
      .set('x-request-id', `req-${dataId}`)
      .set(
        'x-signature',
        opts.signature ?? signMp(dataId, `req-${dataId}`, SECRET),
      )
      .send({
        id: opts.eventId ?? `evt-${dataId}`,
        type: 'payment',
        action: 'payment.updated',
        data: { id: dataId },
      });

  beforeAll(async () => {
    process.env.MP_WEBHOOK_SECRET = SECRET;
    process.env.MP_ACCESS_TOKEN = 'TEST-token';
    app = await createApp();
    payments = app.get(getModelToken(Payment.name));
    events = app.get(getModelToken(BillingEvent.name));
    getPayment = jest.spyOn(app.get(MercadoPagoClient), 'getPayment');
    app.get(BillingHooks).onPayment(({ payment }) => {
      hookCalls.push(`${payment.providerPaymentId}:${payment.status}`);
    });
  });
  afterAll(async () => {
    delete process.env.MP_WEBHOOK_SECRET;
    delete process.env.MP_ACCESS_TOKEN;
    await app.close();
  });

  it('C1: firma alterada → 401 y no se guarda nada', async () => {
    getPayment.mockResolvedValue(mpPayment('100', 'approved'));
    const bad = signMp('100', 'req-100', 'otro-secreto');
    await send('100', { signature: bad }).expect(401);
    await new Promise((r) => setTimeout(r, 100));
    expect(await events.countDocuments({ dataId: '100' })).toBe(0);
    expect(await payments.countDocuments({ providerPaymentId: '100' })).toBe(0);
    expect(getPayment).not.toHaveBeenCalled();
  });

  it('C3: el cuerpo no manda — se guarda lo que dice la API (rechazado)', async () => {
    getPayment.mockResolvedValue(mpPayment('200', 'rejected'));
    await send('200').expect(200);
    await until(
      async () =>
        (await payments.countDocuments({ providerPaymentId: '200' })) === 1,
    );
    const p = await payments.findOne({ providerPaymentId: '200' }).lean();
    expect(p).toMatchObject({
      status: 'rejected',
      amount: 116.82,
      kind: 'plan',
    });
    expect(String(p!.tenantId)).toBe(tenantId);
  });

  it('C2: el mismo evento dos veces se procesa una sola vez', async () => {
    getPayment.mockClear();
    getPayment.mockResolvedValue(mpPayment('300', 'approved'));
    await send('300').expect(200);
    await send('300').expect(200);
    await until(
      async () =>
        (await events.countDocuments({
          dataId: '300',
          status: 'processed',
        })) === 1,
    );
    await new Promise((r) => setTimeout(r, 100));
    expect(await events.countDocuments({ dataId: '300' })).toBe(1);
    expect(getPayment).toHaveBeenCalledTimes(1);
    expect(hookCalls.filter((h) => h.startsWith('300:'))).toEqual([
      '300:approved',
    ]);
  });

  it('si la API falla el evento queda pendiente y el cron lo reintenta', async () => {
    getPayment.mockRejectedValueOnce(new Error('MP caído'));
    await send('400').expect(200);
    await until(
      async () => !!(await events.findOne({ dataId: '400', attempts: 1 })),
    );
    await events.updateOne(
      { dataId: '400' },
      { $set: { nextAttemptAt: new Date(0) } },
    );
    getPayment.mockResolvedValue(mpPayment('400', 'approved'));
    await app.get(BillingEventsService).drain();
    expect(await events.findOne({ dataId: '400' }).lean()).toMatchObject({
      status: 'processed',
    });
    expect(
      await payments.findOne({ providerPaymentId: '400' }).lean(),
    ).toMatchObject({ status: 'approved' });
  });

  it('C4: un pago aprobado sin webhook se concilia en la siguiente corrida', async () => {
    const ref = `chk-${new Types.ObjectId().toHexString()}`;
    await payments.create({
      tenantId: new Types.ObjectId(tenantId),
      concept: 'Plan Crece mensual',
      amount: 293.82,
      status: 'pending',
      paidAt: new Date(),
      externalReference: ref,
    });
    await payments.collection.updateOne(
      { externalReference: ref },
      { $set: { createdAt: new Date(Date.now() - 45 * 60_000) } },
    );
    jest.spyOn(app.get(MercadoPagoClient), 'searchPayments').mockResolvedValue([
      mpPayment('500', 'approved', {
        external_reference: ref,
        transaction_amount: 293.82,
      }),
    ]);

    const changed = await app.get(PaymentsService).reconcile();
    expect(changed).toBeGreaterThanOrEqual(1);
    const p = await payments.find({ externalReference: ref }).lean();
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({
      status: 'approved',
      providerPaymentId: '500',
    });
  });

  it('procesar el mismo evento dos veces a la vez dispara el cambio una sola vez', async () => {
    getPayment.mockResolvedValue(mpPayment('600', 'approved'));
    const svc = app.get(BillingEventsService);
    const e = await svc.enqueue({
      type: 'payment',
      dataId: '600',
      eventId: 'evt-600',
      raw: {},
    });
    await Promise.all([svc.process(e!), svc.process(e!), svc.drain()]);
    expect(hookCalls.filter((h) => h.startsWith('600:'))).toEqual([
      '600:approved',
    ]);
    expect(await events.findOne({ dataId: '600' }).lean()).toMatchObject({
      status: 'processed',
    });
  });

  it('dos avisos distintos del mismo pago a la vez no duplican el pago ni el aviso', async () => {
    const svc = app.get(PaymentsService);
    await Promise.all([
      svc.syncFromMp(mpPayment('700', 'approved')),
      svc.syncFromMp(mpPayment('700', 'approved')),
    ]);
    expect(await payments.countDocuments({ providerPaymentId: '700' })).toBe(1);
    expect(hookCalls.filter((h) => h.startsWith('700:'))).toEqual([
      '700:approved',
    ]);
  });

  it('R4: cobro de suscripción (subscription_authorized_payment) reconsulta el pago real', async () => {
    jest
      .spyOn(app.get(MercadoPagoClient), 'getAuthorizedPayment')
      .mockResolvedValue({
        id: 'ap-1',
        preapproval_id: 'pre-9',
        status: 'processed',
        payment: { id: '800', status: 'approved' },
      });
    getPayment.mockResolvedValue(mpPayment('800', 'approved'));
    const dataId = 'ap-1';
    await http()
      .post(
        `/billing/webhooks/mercadopago?data.id=${dataId}&type=subscription_authorized_payment`,
      )
      .set('x-request-id', 'req-ap')
      .set('x-signature', signMp(dataId, 'req-ap', SECRET))
      .send({
        id: 'evt-ap-1',
        type: 'subscription_authorized_payment',
        data: { id: dataId },
      })
      .expect(200);
    await until(
      async () =>
        (await payments.countDocuments({ providerPaymentId: '800' })) === 1,
    );
    expect(
      await payments.findOne({ providerPaymentId: '800' }).lean(),
    ).toMatchObject({
      status: 'approved',
      mpPreapprovalId: 'pre-9',
    });
  });

  it('R4: cambio de suscripción (subscription_preapproval) avisa a los suscriptores', async () => {
    jest.spyOn(app.get(MercadoPagoClient), 'getPreapproval').mockResolvedValue({
      id: 'pre-10',
      status: 'authorized',
      external_reference: 'chk-x',
    });
    const seen: string[] = [];
    app.get(BillingHooks).onPreapproval((p) => {
      seen.push(`${p.id}:${p.status}`);
    });
    await http()
      .post(
        '/billing/webhooks/mercadopago?data.id=pre-10&type=subscription_preapproval',
      )
      .set('x-request-id', 'req-pre')
      .set('x-signature', signMp('pre-10', 'req-pre', SECRET))
      .send({
        id: 'evt-pre-10',
        type: 'subscription_preapproval',
        data: { id: 'pre-10' },
      })
      .expect(200);
    await until(() => Promise.resolve(seen.length === 1));
    expect(seen).toEqual(['pre-10:authorized']);
  });
});
