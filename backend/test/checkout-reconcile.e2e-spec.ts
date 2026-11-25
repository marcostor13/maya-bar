import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { createApp } from './support/app';
import {
  MercadoPagoClient,
  type MpPayment,
} from '../src/billing/mercadopago/mercadopago.client';
import { MailService } from '../src/mail/mail.service';
import { CheckoutSession } from '../src/billing/checkout-session.schema';
import { Tenant } from '../src/tenants/tenant.schema';
import { BillingHooks } from '../src/billing/billing-hooks.service';
import { PlanChangeService } from '../src/billing/plan-change.service';
import { CheckoutReconcileService } from '../src/billing/checkout-reconcile.service';

let seq = 0;

/** HU78: una compra pagada se activa aunque el webhook de Mercado Pago no llegue. */
describe('Conciliación de compras sin webhook (HU78, e2e)', () => {
  let app: NestExpressApplication;
  let sessions: Model<CheckoutSession>;
  let tenants: Model<Tenant>;
  let mp: MercadoPagoClient;
  const http = () => request(app.getHttpServer());

  const buy = async (email: string, period: 'mensual' | 'anual') =>
    (
      (
        await http()
          .post('/public/checkout')
          .send({
            plan: 'crece',
            period,
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

  /** El webhook no llegó: la compra lleva 20 minutos esperando. */
  const age = (publicId: string) =>
    // `createdAt` es inmutable en Mongoose: se cambia en la colección.
    sessions.collection.updateOne(
      { publicId },
      { $set: { createdAt: new Date(Date.now() - 20 * 60_000) } },
    );

  const paid = (extra: Partial<MpPayment>): MpPayment => ({
    id: `rec-${++seq}`,
    status: 'approved',
    transaction_amount: 293.82,
    currency_id: 'PEN',
    payment_type_id: 'credit_card',
    date_approved: new Date().toISOString(),
    ...extra,
  });

  beforeAll(async () => {
    process.env.MP_ACCESS_TOKEN = 'TEST-token';
    app = await createApp();
    mp = app.get(MercadoPagoClient);
    jest.spyOn(mp, 'createPreapproval').mockImplementation(() =>
      Promise.resolve({
        id: `pre-${++seq}`,
        status: 'pending',
        init_point: 'https://mp.test/pre',
      }),
    );
    jest
      .spyOn(mp, 'createPreference')
      .mockResolvedValue({ id: 'pref', init_point: 'https://mp.test/pref' });
    jest.spyOn(app.get(MailService), 'sendHtml').mockResolvedValue('mock');
    sessions = app.get(getModelToken(CheckoutSession.name));
    tenants = app.get(getModelToken(Tenant.name));
  });

  afterAll(async () => {
    delete process.env.MP_ACCESS_TOKEN;
    await app.close();
  });

  it('mensual: preapproval autorizado y su primer cobro → cuenta activa con la suscripción', async () => {
    const email = 'mensual-hu78@e2e.test';
    const publicId = await buy(email, 'mensual');
    const preId = (await sessions.findOne({ publicId }).lean())!
      .mpPreapprovalId!;
    await age(publicId);
    jest.spyOn(mp, 'getPreapproval').mockResolvedValue({
      id: preId,
      status: 'authorized',
      external_reference: publicId,
    });
    jest.spyOn(mp, 'searchAuthorizedPayments').mockResolvedValue([
      {
        id: 1,
        preapproval_id: preId,
        status: 'processed',
        payment: { id: 'mp-pay-1', status: 'approved' },
      },
    ]);
    jest
      .spyOn(mp, 'getPayment')
      .mockResolvedValue(paid({ id: 'mp-pay-1', preapproval_id: preId }));

    expect(await app.get(CheckoutReconcileService).reconcile()).toBeGreaterThan(
      0,
    );

    const t = (await tenants.findOne({ email }).lean())!;
    expect(t.subscription).toMatchObject({
      status: 'active',
      period: 'monthly',
      mpPreapprovalId: preId,
    });
    expect((await sessions.findOne({ publicId }).lean())!.status).toBe(
      'fulfilled',
    );
  });

  it('cancelada desde Mercado Pago → sigue activa hasta el fin del periodo y no se puede reanudar', async () => {
    const t = (await tenants
      .findOne({ email: 'mensual-hu78@e2e.test' })
      .lean())!;
    const preId = t.subscription!.mpPreapprovalId!;
    await app
      .get(BillingHooks)
      .emitPreapproval({ id: preId, status: 'cancelled' });
    const after = (await tenants.findById(t._id).lean())!.subscription!;
    expect(
      (await app.get(PlanChangeService).options(String(t._id))).canceledInMp,
    ).toBe(true);
    expect(after).toMatchObject({ status: 'active', cancelAtPeriodEnd: true });
    jest
      .spyOn(mp, 'updatePreapproval')
      .mockRejectedValue(new Error('cancelled'));
    // Fallo pasajero de Mercado Pago: no se dice que está cancelada.
    jest
      .spyOn(mp, 'getPreapproval')
      .mockResolvedValueOnce({ id: preId, status: 'paused' });
    await expect(
      app.get(PlanChangeService).reactivate(String(t._id)),
    ).rejects.toThrow('Inténtalo de nuevo');
    jest
      .spyOn(mp, 'getPreapproval')
      .mockResolvedValueOnce({ id: preId, status: 'cancelled' });
    await expect(
      app.get(PlanChangeService).reactivate(String(t._id)),
    ).rejects.toThrow('Vuelve a elegir tu plan');
  });

  it('anual (pago único): se encuentra el pago por la referencia y se activa', async () => {
    const email = 'anual-hu78@e2e.test';
    const publicId = await buy(email, 'anual');
    await age(publicId);
    jest
      .spyOn(mp, 'searchPayments')
      .mockImplementation((ref: string) =>
        Promise.resolve(
          ref === publicId ? [paid({ external_reference: publicId })] : [],
        ),
      );
    await app.get(CheckoutReconcileService).reconcile();
    expect(
      (await tenants.findOne({ email }).lean())!.subscription,
    ).toMatchObject({
      status: 'active',
      period: 'annual',
    });
  });

  it('mensual cancelada antes de pagar → la compra queda rechazada y no se vuelve a consultar', async () => {
    const publicId = await buy('cancelada-hu78@e2e.test', 'mensual');
    const preId = (await sessions.findOne({ publicId }).lean())!
      .mpPreapprovalId!;
    await age(publicId);
    jest
      .spyOn(mp, 'getPreapproval')
      .mockResolvedValue({ id: preId, status: 'cancelled' });
    await app.get(CheckoutReconcileService).reconcile();
    expect((await sessions.findOne({ publicId }).lean())!.status).toBe(
      'rejected',
    );
  });

  it('impago y cancelada desde Mercado Pago → se cierra ya', async () => {
    const t = (await tenants
      .findOne({ email: 'mensual-hu78@e2e.test' })
      .lean())!;
    const preId = t.subscription!.mpPreapprovalId!;
    await tenants.updateOne(
      { _id: t._id },
      {
        $set: {
          'subscription.status': 'past_due',
          'subscription.cancelAtPeriodEnd': false,
        },
      },
    );
    await app
      .get(BillingHooks)
      .emitPreapproval({ id: preId, status: 'cancelled' });
    expect((await tenants.findById(t._id).lean())!.subscription).toMatchObject({
      status: 'canceled',
      cancelReason: 'Cancelada desde Mercado Pago',
    });
  });

  it('una compra recién creada no se consulta (se espera al webhook)', async () => {
    const publicId = await buy('fresca-hu78@e2e.test', 'anual');
    const search = jest.spyOn(mp, 'searchPayments').mockResolvedValue([]);
    await app.get(CheckoutReconcileService).reconcile();
    expect(search).not.toHaveBeenCalledWith(publicId);
  });
});
