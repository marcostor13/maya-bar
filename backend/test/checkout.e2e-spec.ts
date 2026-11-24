import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createApp } from './support/app';
import {
  MercadoPagoClient,
  type MpPayment,
} from '../src/billing/mercadopago/mercadopago.client';
import { PaymentsService } from '../src/billing/payments.service';

type Body = Record<string, unknown>;

const buyer = {
  company: 'Pastelería Ana',
  name: 'Ana Pérez',
  email: 'ana-checkout@e2e.test',
  phone: '+51999111222',
};
const boleta = {
  docType: 'boleta',
  docNumber: '12345678',
  legalName: 'Ana Pérez',
};

function mpPayment(ref: string, status: string, type: string): MpPayment {
  return {
    id: `${ref}-${status}`,
    status,
    transaction_amount: 116.82,
    currency_id: 'PEN',
    description: 'Plan',
    external_reference: ref,
    payment_type_id: type,
    date_created: new Date().toISOString(),
  };
}

/** HU46: checkout público con Mercado Pago simulado. */
describe('Checkout (HU46)', () => {
  let app: NestExpressApplication;
  let mp: MercadoPagoClient;
  let preference: jest.SpyInstance;
  let preapproval: jest.SpyInstance;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    process.env.MP_ACCESS_TOKEN = 'TEST-token';
    app = await createApp();
    mp = app.get(MercadoPagoClient);
    preference = jest.spyOn(mp, 'createPreference').mockResolvedValue({
      id: 'pref-1',
      init_point: 'https://mp.test/pref-1',
    });
    preapproval = jest.spyOn(mp, 'createPreapproval').mockResolvedValue({
      id: 'pre-1',
      status: 'pending',
      init_point: 'https://mp.test/pre-1',
    });
  });
  afterAll(async () => {
    delete process.env.MP_ACCESS_TOKEN;
    await app.close();
  });

  it('C1: el total del resumen es el de la suscripción mensual creada', async () => {
    const quote = (
      await http()
        .get('/public/checkout/quote?plan=inicia&period=mensual&currency=PEN')
        .expect(200)
    ).body as Body;
    expect(quote).toMatchObject({ subtotal: 99, igv: 17.82, total: 116.82 });

    const res = (
      await http()
        .post('/public/checkout')
        .send({
          plan: 'inicia',
          period: 'mensual',
          currency: 'PEN',
          buyer,
          billing: boleta,
          acceptTerms: true,
        })
        .expect(201)
    ).body as Body;
    expect(res).toMatchObject({
      redirectUrl: 'https://mp.test/pre-1',
      total: 116.82,
    });
    const [body] = preapproval.mock.calls[0] as [
      {
        auto_recurring: { transaction_amount: number; currency_id: string };
        external_reference: string;
      },
    ];
    expect(body.auto_recurring).toMatchObject({
      transaction_amount: 116.82,
      currency_id: 'PEN',
    });
    expect(body.external_reference).toBe(res.session);
  });

  it('C1: anual por Checkout Pro con el mismo total', async () => {
    const res = (
      await http()
        .post('/public/checkout')
        .send({
          plan: 'crece',
          period: 'anual',
          currency: 'PEN',
          buyer,
          billing: boleta,
          acceptTerms: true,
        })
        .expect(201)
    ).body as Body;
    const [body] = preference.mock.calls[0] as [
      { items: { unit_price: number }[]; external_reference: string },
    ];
    expect(body.items[0].unit_price).toBe(2938.2);
    expect(res.total).toBe(2938.2);
    expect(body.external_reference).toBe(res.session);
  });

  it('C2: RUC con dígito verificador inválido o sin términos no deja continuar', async () => {
    const factura = {
      docType: 'factura',
      docNumber: '20123456789',
      legalName: 'Acme SAC',
      address: 'Lima',
    };
    const bad = await http()
      .post('/public/checkout')
      .send({
        plan: 'inicia',
        period: 'anual',
        currency: 'PEN',
        buyer,
        billing: factura,
        acceptTerms: true,
      })
      .expect(400);
    expect((bad.body as Body).message).toContain('RUC');
    await http()
      .post('/public/checkout')
      .send({
        plan: 'inicia',
        period: 'anual',
        currency: 'PEN',
        buyer,
        billing: boleta,
        acceptTerms: false,
      })
      .expect(400);
  });

  it('C3: la URL de vuelta no activa nada; solo el pago confirmado', async () => {
    const { session } = (
      await http()
        .post('/public/checkout')
        .send({
          plan: 'inicia',
          period: 'trimestral',
          currency: 'PEN',
          buyer,
          billing: boleta,
          acceptTerms: true,
        })
        .expect(201)
    ).body as { session: string };
    // Lo que trae la vuelta de Mercado Pago no se usa para nada.
    const before = await http()
      .get(
        `/public/checkout/${session}?status=approved&collection_status=approved`,
      )
      .expect(200);
    expect((before.body as Body).status).toBe('pending');

    await app
      .get(PaymentsService)
      .syncFromMp(mpPayment(session, 'approved', 'credit_card'));
    const after = await http().get(`/public/checkout/${session}`).expect(200);
    expect((after.body as Body).status).toBe('fulfilled');
  });

  it('C4: PagoEfectivo pendiente queda "esperando pago" con el medio', async () => {
    const { session } = (
      await http()
        .post('/public/checkout')
        .send({
          plan: 'inicia',
          period: 'anual',
          currency: 'PEN',
          buyer,
          billing: boleta,
          acceptTerms: true,
        })
        .expect(201)
    ).body as { session: string };
    await app
      .get(PaymentsService)
      .syncFromMp(mpPayment(session, 'pending', 'ticket'));
    const res = await http().get(`/public/checkout/${session}`).expect(200);
    expect(res.body).toMatchObject({
      status: 'awaiting_payment',
      paymentMethod: 'ticket',
    });
  });

  it('una sesión inexistente da 404 y no se filtran datos del comprador', async () => {
    await http().get('/public/checkout/no-existe').expect(404);
  });
});
