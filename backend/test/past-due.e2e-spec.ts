import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { bearer, createApp, registerTenant, type Session } from './support/app';
import type { MpPayment } from '../src/billing/mercadopago/mercadopago.client';
import { PaymentsService } from '../src/billing/payments.service';
import { MailService } from '../src/mail/mail.service';
import { BillingAccessService } from '../src/billing/billing-access.service';
import { BillingEmail } from '../src/billing/emails/billing-email.schema';
import { PastDueService } from '../src/billing/past-due.service';
import { Tenant } from '../src/tenants/tenant.schema';
import { ConversationsService } from '../src/conversations/conversations.service';
import { Conversation } from '../src/conversations/conversation.schema';
import { MercadoPagoClient } from '../src/billing/mercadopago/mercadopago.client';
import { SubscriptionLifecycleService } from '../src/billing/subscription-lifecycle.service';
import { TenantsService } from '../src/tenants/tenants.service';
import { CheckoutSession } from '../src/billing/checkout-session.schema';

const DAY = 86400_000;
let seq = 0;

/** HU51: cobro fallido, 7 días de gracia y solo lectura sin borrar nada. */
describe('Pago fallido y bloqueo suave (HU51)', () => {
  let app: NestExpressApplication;
  let tenants: Model<Tenant>;
  let emails: Model<BillingEmail>;
  let owner: Session;
  let tid: string;
  const http = () => request(app.getHttpServer());
  const recurring = (
    status: string,
    extra: Partial<MpPayment> = {},
  ): MpPayment => ({
    id: `pd-${++seq}`,
    status,
    transaction_amount: 293.82,
    currency_id: 'PEN',
    payment_type_id: 'credit_card',
    preapproval_id: `pre-${tid}`,
    date_approved: status === 'approved' ? new Date().toISOString() : null,
    ...extra,
  });
  const sub = async () => (await tenants.findById(tid).lean())!.subscription!;

  beforeAll(async () => {
    process.env.MP_ACCESS_TOKEN = 'TEST-token';
    app = await createApp();
    jest.spyOn(app.get(MailService), 'sendHtml').mockResolvedValue('mock');
    tenants = app.get(getModelToken(Tenant.name));
    emails = app.get(getModelToken(BillingEmail.name));
    owner = await registerTenant(app, 'Moroso SAC');
    tid = owner.user.tenantId!;
    await tenants.updateOne(
      { _id: tid },
      {
        $set: {
          plan: 'crece',
          subscription: {
            status: 'active',
            period: 'monthly',
            currency: 'PEN',
            amount: 249,
            currentPeriodEnd: new Date(Date.now() + DAY),
            mpPreapprovalId: `pre-${tid}`,
          },
        },
      },
    );
    app.get(BillingAccessService).invalidate(tid);
  });
  afterAll(async () => {
    delete process.env.MP_ACCESS_TOKEN;
    await app.close();
  });

  it('un intento rechazado de la compra que llega tarde no se toma como cobro mensual', async () => {
    await app
      .get<Model<CheckoutSession>>(getModelToken(CheckoutSession.name))
      .collection.insertOne({
        publicId: `buy-${tid}`,
        mpPreapprovalId: `pre-${tid}`,
        status: 'fulfilled',
        paymentId: 'first-ok',
        fulfilledAt: new Date(),
      });
    await app.get(PaymentsService).syncFromMp(
      recurring('rejected', {
        date_created: new Date(Date.now() - 3600_000).toISOString(),
      }),
    );
    expect((await sub()).status).toBe('active');
  });

  it('cobro mensual rechazado → past_due, 7 días de gracia y aviso del día 0 (una vez)', async () => {
    const before = Date.now();
    const p = recurring('rejected', {
      status_detail: 'cc_rejected_insufficient_amount',
    });
    await app.get(PaymentsService).syncFromMp(p);
    await app.get(PaymentsService).syncFromMp(p);
    await app.get(PaymentsService).syncFromMp(recurring('rejected')); // reintento de MP
    const s = await sub();
    expect(s.status).toBe('past_due');
    const grace = new Date(s.graceEndsAt!).getTime() - before;
    expect(grace).toBeGreaterThan(7 * DAY - 60_000);
    expect(grace).toBeLessThan(7 * DAY + 60_000);
    const sent = await emails
      .find({ tenantId: new Types.ObjectId(tid), type: 'past_due' })
      .lean();
    expect(sent).toHaveLength(1);
    expect(sent[0].key.endsWith(':0')).toBe(true);
    expect(sent[0].html).toContain('saldo suficiente');
    expect(sent[0].html).toContain(
      '/checkout?plan=crece&amp;periodo=mensual&amp;moneda=PEN',
    );
  });

  it('avisos de los días 3 y 6, sin repetir', async () => {
    const since = new Date((await sub()).pastDueSince!).getTime();
    const svc = app.get(PastDueService);
    await svc.reminders(new Date(since + 1 * DAY));
    await svc.reminders(new Date(since + 3 * DAY + 3600_000));
    await svc.reminders(new Date(since + 3 * DAY + 7200_000));
    await svc.reminders(new Date(since + 6 * DAY + 3600_000));
    const keys = (
      await emails
        .find({ tenantId: new Types.ObjectId(tid), type: 'past_due' })
        .lean()
    )
      .map((e) => e.key.split(':').pop())
      .sort();
    expect(keys).toEqual(['0', '3', '6']);
  });

  it('C1: en past_due se puede escribir; en expired da 402 y exportar funciona', async () => {
    await http()
      .post('/customers')
      .set(bearer(owner))
      .send({ name: 'Ana', phone: '+51999111001' })
      .expect(201);
    expect(
      (await http().get('/billing/status').set(bearer(owner)).expect(200)).body,
    ).toMatchObject({
      status: 'past_due',
      readOnly: false,
    });

    // Día 8: la gracia venció.
    await tenants.updateOne(
      { _id: tid },
      { $set: { 'subscription.graceEndsAt': new Date(Date.now() - 1000) } },
    );
    app.get(BillingAccessService).invalidate(tid);
    const res = await http()
      .post('/customers')
      .set(bearer(owner))
      .send({ name: 'Beto', phone: '+51999111002' })
      .expect(402);
    expect((res.body as { code: string }).code).toBe('SUBSCRIPTION_REQUIRED');
    const csv = await http()
      .get('/customers/export.csv')
      .set(bearer(owner))
      .expect(200);
    expect(csv.text).toContain('Ana');
    expect(await app.get(BillingAccessService).canOperate(tid)).toBe(false);
    // Enviar un mensaje también da 402 (el interceptor corta antes del canal).
    const conv = await app
      .get<Model<Conversation>>(getModelToken(Conversation.name))
      .collection.insertOne({
        tenantId: new Types.ObjectId(tid),
        channel: 'whatsapp',
        contact: '51999000111',
      });
    await http()
      .post(`/conversations/${String(conv.insertedId)}/messages`)
      .set(bearer(owner))
      .send({ text: 'hola' })
      .expect(402);
  });

  it('C2: en expired un WhatsApp entrante se guarda en la bandeja', async () => {
    const contact = '51999222333';
    await app.get(ConversationsService).handleWhatsAppInbound(
      {
        _id: new Types.ObjectId(),
        tenantId: new Types.ObjectId(tid),
        provider: 'cloudapi',
      } as never,
      { contact, type: 'text', text: 'hola, sigo interesado' },
    );
    const conv = await app
      .get<Model<Conversation>>(getModelToken(Conversation.name))
      .findOne({ tenantId: new Types.ObjectId(tid), contact })
      .lean();
    expect(conv).toBeTruthy();
    // Y se pueden exportar las conversaciones en solo lectura.
    const csv = await http()
      .get('/conversations/export.csv')
      .set(bearer(owner))
      .expect(200);
    expect(csv.text).toContain('hola, sigo interesado');
  });

  it('a los 60 días en solo lectura avisa al superadmin una vez; no borra nada', async () => {
    const svc = app.get(PastDueService);
    expect(await svc.longExpired()).toBe(0);
    const later = new Date(Date.now() + 61 * DAY);
    expect(await svc.longExpired(later)).toBe(1);
    expect(await svc.longExpired(later)).toBe(0);
    expect(await tenants.exists({ _id: tid })).toBeTruthy();
  });

  it('C3: pagar en expired deja la cuenta activa y los procesos vuelven a correr', async () => {
    await app.get(PaymentsService).syncFromMp(recurring('approved'));
    const s = await sub();
    expect(s.status).toBe('active');
    expect(s.graceEndsAt).toBeUndefined();
    expect(s.pastDueSince).toBeUndefined();
    expect(await app.get(BillingAccessService).canOperate(tid)).toBe(true);
    await http()
      .post('/customers')
      .set(bearer(owner))
      .send({ name: 'Carla', phone: '+51999111003' })
      .expect(201);
  });

  it('pagar con una suscripción nueva: el periodo empieza hoy y la anterior se cancela', async () => {
    await tenants.updateOne(
      { _id: tid },
      {
        $set: {
          'subscription.status': 'past_due',
          'subscription.currentPeriodEnd': new Date(Date.now() - 20 * DAY),
          'subscription.graceEndsAt': new Date(Date.now() - 13 * DAY),
        },
      },
    );
    await app.get(TenantsService).activatePlan(tid, {
      plan: 'crece',
      period: 'monthly',
      currency: 'PEN',
      amount: 249,
      mpPreapprovalId: `pre2-${tid}`,
    });
    const s = await sub();
    const days = (new Date(s.currentPeriodEnd!).getTime() - Date.now()) / DAY;
    expect(days).toBeGreaterThan(27);
    expect(s.preapprovalsToCancel).toEqual([`pre-${tid}`]);
    const cancel = jest
      .spyOn(app.get(MercadoPagoClient), 'updatePreapproval')
      .mockResolvedValue({ id: `pre-${tid}`, status: 'cancelled' });
    expect(
      await app.get(SubscriptionLifecycleService).cancelReplacedPreapprovals(),
    ).toBe(1);
    expect(cancel).toHaveBeenCalledWith(`pre-${tid}`, { status: 'cancelled' });
    expect((await sub()).preapprovalsToCancel).toEqual([]);
  });

  it('R2: un plan trimestral vencido sin pagar pasa a past_due con aviso del día 0', async () => {
    const other = await registerTenant(app, 'Trimestral SAC');
    const oid = other.user.tenantId!;
    await tenants.updateOne(
      { _id: oid },
      {
        $set: {
          plan: 'crece',
          subscription: {
            status: 'active',
            period: 'quarterly',
            currency: 'PEN',
            amount: 700,
            currentPeriodEnd: new Date(Date.now() - 3600_000),
          },
        },
      },
    );
    await app.get(SubscriptionLifecycleService).markPastDue();
    const t = (await tenants.findById(oid).lean())!;
    expect(t.subscription!.status).toBe('past_due');
    expect(t.subscription!.pastDueSince).toBeDefined();
    await app.get(PastDueService).reminders();
    const e = await emails
      .find({ tenantId: new Types.ObjectId(oid), type: 'past_due' })
      .lean();
    expect(e.map((x) => x.key.split(':').pop())).toEqual(['0']);
    expect(e[0].html).toContain('venció sin renovarse');
  });
});
