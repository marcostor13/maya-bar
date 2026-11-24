import type { NestExpressApplication } from '@nestjs/platform-express';
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import request from 'supertest';
import { bearer, createApp, registerTenant, type Session } from './support/app';
import { Local } from '../src/locals/local.schema';
import { Event } from '../src/events/event.schema';
import { EventRegistration } from '../src/events/event-registration.schema';
import { MercadoPagoClient } from '../src/billing/mercadopago/mercadopago.client';
import { signMp } from '../src/billing/mercadopago/mp-signature';
import { EventTicketsService } from '../src/event-tickets/event-tickets.service';

const SECRET = 'whsec-entradas';
type Reg = {
  _id: string;
  paymentStatus?: string;
  status: string;
  ticketCode: string;
};

describe('Pago en línea de entradas de eventos (HU67, e2e)', () => {
  let app: NestExpressApplication;
  let owner: Session;
  let other: Session;
  let events: Model<Event>;
  let regs: Model<EventRegistration>;
  let mp: MercadoPagoClient;
  let eventId: string;
  let slug: string;
  let pref: jest.SpyInstance;
  let payment: jest.SpyInstance;
  let refund: jest.SpyInstance;
  const http = () => request(app.getHttpServer());
  const env = {
    MP_WEBHOOK_SECRET: SECRET,
    MP_CLIENT_ID: 'app-123',
    MP_CLIENT_SECRET: 'sec-123',
    EVENT_TICKET_FEE_PCT: '5',
  };

  const sold = async (key: string) =>
    (await events.findById(eventId).lean<Event>().exec())!.ticketTypes.find(
      (t) => t.key === key,
    )!.sold;
  const buy = (ticketType: string, email: string, quantity = 1) =>
    http()
      .post(`/public/events/${eventId}/checkout`)
      .send({ ticketType, quantity, name: 'Ana', email });
  const notify = (
    paymentId: string,
    userId: number | string = 777,
    signature?: string,
  ) =>
    http()
      .post(`/public/event-payments/webhook?data.id=${paymentId}&type=payment`)
      .set('x-request-id', `req-${paymentId}`)
      .set(
        'x-signature',
        signature ?? signMp(paymentId, `req-${paymentId}`, SECRET),
      )
      .send({ type: 'payment', user_id: userId, data: { id: paymentId } });
  const checkInCode = (code: string, session = owner) =>
    http()
      .patch(`/events/${eventId}/registrations/check-in/by-code`)
      .set(bearer(session))
      .send({ code });

  beforeAll(async () => {
    Object.assign(process.env, env);
    app = await createApp();
    owner = await registerTenant(app, 'Productora');
    other = await registerTenant(app, 'Ajena Eventos');
    events = app.get<Model<Event>>(getModelToken(Event.name));
    regs = app.get<Model<EventRegistration>>(
      getModelToken(EventRegistration.name),
    );
    mp = app.get(MercadoPagoClient);
    pref = jest.spyOn(mp, 'createPreferenceFor').mockImplementation(() =>
      Promise.resolve({
        id: `pref-${Date.now()}`,
        init_point:
          'https://www.mercadopago.com.pe/checkout/v1/redirect?pref_id=x',
      }),
    );
    payment = jest.spyOn(mp, 'getPaymentFor');
    refund = jest.spyOn(mp, 'refundPaymentFor').mockResolvedValue({ id: 1 });
    jest.spyOn(mp, 'oauthToken').mockResolvedValue({
      access_token: 'APP_USR-SELLER',
      refresh_token: 'TG-R',
      public_key: 'APP_USR-pk',
      user_id: 777,
      expires_in: 15_552_000,
      live_mode: true,
    });

    const local = await app
      .get<Model<Local>>(getModelToken(Local.name))
      .create({
        tenantId: new Types.ObjectId(owner.user.tenantId!),
        name: 'Sede',
      });
    const res = await http()
      .post('/events')
      .set(bearer(owner))
      .send({
        title: 'Fiesta de fin de año',
        date: '2030-12-31T22:00:00.000Z',
        localId: String(local._id),
        status: 'published',
        onlinePayment: true,
        ticketTypes: [
          { name: 'General', price: 30, capacity: 2 },
          { name: 'VIP', price: 80 },
          {
            name: 'Preventa',
            price: 20,
            salesEndAt: '2020-01-01T00:00:00.000Z',
          },
        ],
      })
      .expect(201);
    eventId = (res.body as { _id: string })._id;
    slug = (res.body as { slug: string }).slug;
    expect((res.body as Event).ticketTypes.map((t) => [t.key, t.sold])).toEqual(
      [
        ['general', 0],
        ['vip', 0],
        ['preventa', 0],
      ],
    );
  });
  afterAll(async () => {
    await app.close();
    for (const k of Object.keys(env)) delete process.env[k];
  });

  it('conecta la cuenta de Mercado Pago de la empresa por OAuth', async () => {
    let pub = await http().get(`/public/events/${slug}`).expect(200);
    expect(
      (pub.body as { payments: { online: boolean } }).payments.online,
    ).toBe(false);
    await buy('general', 'antes@x.pe').expect(409);
    expect(await sold('general')).toBe(0);

    const connectRes = await http()
      .post('/event-tickets/mp/connect')
      .set(bearer(owner))
      .expect(201);
    const url = new URL((connectRes.body as { url: string }).url);
    expect(url.host).toBe('auth.mercadopago.com');
    expect(url.searchParams.get('client_id')).toBe('app-123');
    const state = url.searchParams.get('state')!;
    // Un state alterado no conecta.
    const bad = await http()
      .get(`/event-tickets/mp/callback?code=C&state=${state}x`)
      .expect(302);
    expect(bad.headers.location).toContain('mp=error');
    const ok = await http()
      .get(
        `/event-tickets/mp/callback?code=C&state=${encodeURIComponent(state)}`,
      )
      .expect(302);
    expect(ok.headers.location).toContain('mp=connected');
    const st = await http()
      .get('/event-tickets/mp/status')
      .set(bearer(owner))
      .expect(200);
    expect(st.body).toMatchObject({
      connected: true,
      mpUserId: '777',
      feePct: 5,
    });

    pub = await http().get(`/public/events/${slug}`).expect(200);
    expect(
      (pub.body as { payments: { online: boolean } }).payments.online,
    ).toBe(true);
    // El registro gratuito queda cerrado en un evento con pago en línea.
    await http()
      .post(`/public/events/${eventId}/register`)
      .send({ name: 'Gratis', email: 'g@x.pe' })
      .expect(400);
  });

  it('C2: la preferencia va a la cuenta de la empresa con la comisión configurada para Maya', async () => {
    const res = await buy('vip', 'vip@x.pe', 2).expect(201);
    const anyMpUrl: unknown = expect.stringContaining('mercadopago');
    const webhookUrl: unknown = expect.stringMatching(
      /\/public\/event-payments\/webhook$/,
    );
    expect(res.body).toMatchObject({
      amount: 160,
      currency: 'PEN',
      paymentStatus: 'pending',
      initPoint: anyMpUrl,
    });
    const [token, body] = pref.mock.calls.at(-1) as [
      string,
      Record<string, unknown>,
    ];
    expect(token).toBe('APP_USR-SELLER');
    expect(body).toMatchObject({
      marketplace_fee: 8,
      external_reference: `evt:${(res.body as { registrationId: string }).registrationId}`,
      items: [{ id: 'vip', quantity: 2, unit_price: 80, currency_id: 'PEN' }],
      notification_url: webhookUrl,
    });
    expect(await sold('vip')).toBe(2);
    await buy('preventa', 'tarde@x.pe').expect(400);
  });

  it('C1: pagada entra; pendiente se rechaza en la puerta; firma falsa no confirma', async () => {
    const res = await buy('general', 'ana@x.pe').expect(201);
    const { registrationId, ticketCode } = res.body as {
      registrationId: string;
      ticketCode: string;
    };
    const door = await checkInCode(ticketCode).expect(409);
    expect((door.body as { message: string }).message).toContain(
      'no está pagada',
    );

    payment.mockResolvedValueOnce({
      id: 9001,
      status: 'approved',
      transaction_amount: 30,
      currency_id: 'PEN',
      external_reference: `evt:${registrationId}`,
    });
    await notify('9001', 777, signMp('9001', 'req-9001', 'otro')).expect(401);
    expect(
      (await regs.findById(registrationId).lean<Reg>().exec())!.paymentStatus,
    ).toBe('pending');

    await notify('9001').expect(200);
    expect(payment).toHaveBeenLastCalledWith('APP_USR-SELLER', '9001');
    expect(
      await regs.findById(registrationId).lean<Reg>().exec(),
    ).toMatchObject({
      paymentStatus: 'paid',
      status: 'confirmed',
      mpPaymentId: '9001',
    });
    const entered = await checkInCode(ticketCode).expect(200);
    expect(entered.body).toMatchObject({
      checkedIn: true,
      alreadyCheckedIn: false,
    });
    // Repetir la notificación no cambia nada.
    payment.mockResolvedValueOnce({
      id: 9001,
      status: 'approved',
      transaction_amount: 30,
      currency_id: 'PEN',
      external_reference: `evt:${registrationId}`,
    });
    await notify('9001').expect(200);
    expect(await sold('general')).toBe(1);
    // La otra empresa no ve ni reembolsa la entrada.
    await http()
      .post(`/events/${eventId}/registrations/${registrationId}/refund`)
      .set(bearer(other))
      .expect(403);
  });

  it('C3: con el cupo agotado no se puede comprar; un pago rechazado o vencido libera el cupo', async () => {
    const second = await buy('general', 'beto@x.pe').expect(201);
    expect(await sold('general')).toBe(2);
    const full = await buy('general', 'carla@x.pe').expect(409);
    expect((full.body as { message: string }).message).toContain('Se agotaron');
    expect(await sold('general')).toBe(2);

    const id2 = (second.body as { registrationId: string }).registrationId;
    payment.mockResolvedValueOnce({
      id: 9002,
      status: 'rejected',
      transaction_amount: 30,
      currency_id: 'PEN',
      external_reference: `evt:${id2}`,
    });
    await notify('9002').expect(200);
    expect(await regs.findById(id2).lean<Reg>().exec()).toMatchObject({
      paymentStatus: 'rejected',
      status: 'cancelled',
    });
    expect(await sold('general')).toBe(1);

    await buy('general', 'carla@x.pe').expect(201);
    expect(await sold('general')).toBe(2);
    // Nadie paga en 30 min: el cron libera.
    const released = await app
      .get(EventTicketsService)
      .expireHolds(new Date(Date.now() + 31 * 60_000));
    expect(released).toBeGreaterThanOrEqual(2); // la de Carla y las 2 VIP
    expect(await sold('general')).toBe(1);
    expect(await sold('vip')).toBe(0);
  });

  it('reembolso desde el asistente: devuelve en Mercado Pago, cancela y libera el cupo', async () => {
    const paid = await regs
      .findOne({ eventId: new Types.ObjectId(eventId), paymentStatus: 'paid' })
      .lean<Reg>()
      .exec();
    const res = await http()
      .post(`/events/${eventId}/registrations/${paid!._id}/refund`)
      .set(bearer(owner))
      .expect(201);
    expect(res.body).toMatchObject({
      paymentStatus: 'refunded',
      status: 'cancelled',
    });
    expect(refund).toHaveBeenCalledWith('APP_USR-SELLER', '9001');
    expect(await sold('general')).toBe(0);
    await checkInCode(paid!.ticketCode).expect(409);
    await http()
      .post(`/events/${eventId}/registrations/${paid!._id}/refund`)
      .set(bearer(owner))
      .expect(409);
  });

  it('no deja bajar el cupo por debajo de lo vendido ni quitar un tipo con ventas', async () => {
    await buy('vip', 'v2@x.pe').expect(201);
    await http()
      .patch(`/events/${eventId}`)
      .set(bearer(owner))
      .send({
        ticketTypes: [
          { key: 'general', name: 'General', price: 30, capacity: 2 },
        ],
      })
      .expect(400);
    const ok = await http()
      .patch(`/events/${eventId}`)
      .set(bearer(owner))
      .send({
        ticketTypes: [
          { key: 'general', name: 'General', price: 35, capacity: 5 },
          { key: 'vip', name: 'VIP', price: 80, capacity: 3 },
        ],
      })
      .expect(200);
    expect(
      (ok.body as Event).ticketTypes.map((t) => [t.key, t.price, t.sold]),
    ).toEqual([
      ['general', 35, 0],
      ['vip', 80, 1],
    ]);
  });
});
