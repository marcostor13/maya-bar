import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import {
  bearer,
  createApp,
  createUser,
  registerTenant,
  type Session,
} from './support/app';
import {
  MercadoPagoClient,
  type MpPayment,
} from '../src/billing/mercadopago/mercadopago.client';
import { PaymentsService } from '../src/billing/payments.service';
import { MailService } from '../src/mail/mail.service';
import { BillingAccessService } from '../src/billing/billing-access.service';
import { PlanChangeService } from '../src/billing/plan-change.service';
import { PlanLimitsService } from '../src/billing/plan-limits.service';
import { CheckoutSession } from '../src/billing/checkout-session.schema';
import { Tenant } from '../src/tenants/tenant.schema';
import { User } from '../src/users/user.schema';
import { TenantsService } from '../src/tenants/tenants.service';

const DAY = 86400_000;
const wait = (ms = 100) => new Promise((r) => setTimeout(r, ms));
let seq = 0;

/** HU52: subir, bajar, cancelar y reactivar el plan. */
describe('Cambio de plan y cancelación (HU52)', () => {
  let app: NestExpressApplication;
  let tenants: Model<Tenant>;
  let users: Model<User>;
  let updatePre: jest.SpyInstance;
  const http = () => request(app.getHttpServer());

  const paid = async (s: Session, plan: string, pre: string) => {
    const tid = s.user.tenantId!;
    await tenants.updateOne(
      { _id: tid },
      {
        $set: {
          plan,
          billingInfo: {
            docType: 'factura',
            docNumber: '20123456789',
            legalName: 'Cliente SAC',
          },
          subscription: {
            status: 'active',
            period: 'monthly',
            currency: 'PEN',
            amount: plan === 'crece' ? 249 : 99,
            currentPeriodEnd: new Date(Date.now() + 15 * DAY),
            mpPreapprovalId: pre,
          },
        },
      },
    );
    app.get(BillingAccessService).invalidate(tid);
    return tid;
  };
  const sub = async (tid: string) =>
    (await tenants.findById(tid).lean())!.subscription!;

  beforeAll(async () => {
    process.env.MP_ACCESS_TOKEN = 'TEST-token';
    app = await createApp();
    jest.spyOn(app.get(MailService), 'sendHtml').mockResolvedValue('mock');
    jest
      .spyOn(app.get(MercadoPagoClient), 'createPreference')
      .mockResolvedValue({ id: 'pref-up', init_point: 'https://mp.test/up' });
    updatePre = jest
      .spyOn(app.get(MercadoPagoClient), 'updatePreapproval')
      .mockResolvedValue({ id: 'x', status: 'ok' });
    tenants = app.get(getModelToken(Tenant.name));
    users = app.get(getModelToken(User.name));
  });
  afterAll(async () => {
    delete process.env.MP_ACCESS_TOKEN;
    await app.close();
  });

  it('C1: subir de Inicia a Crece a mitad de mes cobra la diferencia y activa Crece al aprobarse', async () => {
    const owner = await registerTenant(app, 'Sube SAC');
    const tid = await paid(owner, 'inicia', 'pre-up');
    const opts = (
      await http().get('/billing/plan/options').set(bearer(owner)).expect(200)
    ).body as {
      plans: { plan: string; direction: string; dueNow: number }[];
    };
    const crece = opts.plans.find((p) => p.plan === 'crece')!;
    expect(crece.direction).toBe('up');
    // 15 días de un periodo de ~30: la mitad de (249 − 99).
    expect(crece.dueNow).toBeGreaterThan(70);
    expect(crece.dueNow).toBeLessThan(80);

    const res = (
      await http()
        .post('/billing/plan/upgrade')
        .set(bearer(owner))
        .send({ plan: 'crece' })
        .expect(201)
    ).body as { session: string; redirectUrl: string; total: number };
    expect(res.redirectUrl).toBe('https://mp.test/up');
    const s = await app
      .get<Model<CheckoutSession>>(getModelToken(CheckoutSession.name))
      .findOne({ publicId: res.session })
      .lean();
    expect(s!.kind).toBe('upgrade');
    // Sin pagar, el plan no cambia.
    expect((await tenants.findById(tid).lean())!.plan).toBe('inicia');

    const endBefore = (await sub(tid)).currentPeriodEnd!.getTime();
    updatePre.mockClear();
    const pay: MpPayment = {
      id: `up-${++seq}`,
      status: 'approved',
      transaction_amount: res.total,
      currency_id: 'PEN',
      external_reference: res.session,
      payment_type_id: 'credit_card',
      date_approved: new Date().toISOString(),
    };
    await app.get(PaymentsService).syncFromMp(pay);
    await wait();
    const t = (await tenants.findById(tid).lean())!;
    expect(t.plan).toBe('crece');
    expect(t.subscription!.amount).toBe(249);
    expect(t.subscription!.currentPeriodEnd!.getTime()).toBe(endBefore); // no suma periodo
    expect((await app.get(PlanLimitsService).effective(tid)).limits.users).toBe(
      5,
    );
    // El mensual cobra el monto nuevo desde el siguiente ciclo.
    expect(updatePre).toHaveBeenCalledWith('pre-up', {
      auto_recurring: { transaction_amount: 293.82, currency_id: 'PEN' },
    });
  });

  it('C2: cancelar un mensual deja de cobrar en Mercado Pago y mantiene el acceso hasta el fin', async () => {
    const owner = await registerTenant(app, 'Cancela SAC');
    const tid = await paid(owner, 'crece', 'pre-cancel');
    updatePre.mockClear();
    await http()
      .post('/billing/plan/cancel')
      .set(bearer(owner))
      .send({ reason: 'Muy caro' })
      .expect(201);
    expect(updatePre).toHaveBeenCalledWith('pre-cancel', { status: 'paused' });
    let s = await sub(tid);
    expect(s.cancelAtPeriodEnd).toBe(true);
    expect(s.cancelReason).toBe('Muy caro');
    app.get(BillingAccessService).invalidate(tid);
    expect(await app.get(BillingAccessService).canOperate(tid)).toBe(true);
    await http()
      .post('/customers')
      .set(bearer(owner))
      .send({ name: 'Sigue', phone: '+51999000222' })
      .expect(201);

    // Reactivar antes del fin deshace la cancelación.
    updatePre.mockClear();
    await http()
      .post('/billing/plan/reactivate')
      .set(bearer(owner))
      .expect(201);
    expect(updatePre).toHaveBeenCalledWith('pre-cancel', {
      status: 'authorized',
    });
    expect((await sub(tid)).cancelAtPeriodEnd).toBe(false);

    // Cancela de nuevo y llega el fin del periodo: solo lectura, sin aviso de impago.
    await http()
      .post('/billing/plan/cancel')
      .set(bearer(owner))
      .send({})
      .expect(201);
    await tenants.updateOne(
      { _id: tid },
      {
        $set: { 'subscription.currentPeriodEnd': new Date(Date.now() - 1000) },
      },
    );
    expect(await app.get(PlanChangeService).endCanceled()).toBe(1);
    s = await sub(tid);
    expect(s.status).toBe('canceled');
    expect(s.preapprovalsToCancel).toEqual(['pre-cancel']);
    app.get(BillingAccessService).invalidate(tid);
    expect(await app.get(BillingAccessService).canOperate(tid)).toBe(false);
  });

  it('C3: bajar con 5 usuarios a Inicia pide elegir 2; el resto queda sin acceso, sin borrarse', async () => {
    const owner = await registerTenant(app, 'Baja SAC');
    const tid = await paid(owner, 'crece', 'pre-down');
    const team: Session[] = [];
    for (let i = 0; i < 4; i++)
      team.push(await createUser(app, owner, 'MARKETING'));
    expect(
      await users.countDocuments({
        tenantId: new Types.ObjectId(tid),
        isActive: { $ne: false },
      }),
    ).toBe(5);

    const r = await http()
      .post('/billing/plan/downgrade')
      .set(bearer(owner))
      .send({ plan: 'inicia' })
      .expect(409);
    expect(r.body).toMatchObject({ code: 'CHOOSE_USERS', limit: 2 });
    // Sin un administrador entre los elegidos, no.
    await http()
      .post('/billing/plan/downgrade')
      .set(bearer(owner))
      .send({ plan: 'inicia', keepUserIds: [team[0].user.id, team[1].user.id] })
      .expect(400);

    updatePre.mockClear();
    await http()
      .post('/billing/plan/downgrade')
      .set(bearer(owner))
      .send({ plan: 'inicia', keepUserIds: [owner.user.id, team[0].user.id] })
      .expect(201);
    expect((await sub(tid)).pendingPlan).toBe('inicia');
    expect(updatePre).toHaveBeenCalledWith('pre-down', {
      auto_recurring: { transaction_amount: 116.82, currency_id: 'PEN' },
    });
    // Hasta el fin del periodo nada cambia.
    expect((await tenants.findById(tid).lean())!.plan).toBe('crece');

    // Llega el cobro mensual con el monto nuevo: entra Inicia.
    await app.get(PaymentsService).syncFromMp({
      id: `down-${++seq}`,
      status: 'approved',
      transaction_amount: 116.82,
      currency_id: 'PEN',
      payment_type_id: 'credit_card',
      preapproval_id: 'pre-down',
      date_approved: new Date().toISOString(),
    });
    const t = (await tenants.findById(tid).lean())!;
    expect(t.plan).toBe('inicia');
    expect(t.subscription!.pendingPlan).toBeUndefined();
    const all = await users.find({ tenantId: new Types.ObjectId(tid) }).lean();
    expect(all).toHaveLength(5);
    const active = all
      .filter((u) => u.isActive !== false)
      .map((u) => String(u._id))
      .sort();
    expect(active).toEqual([owner.user.id, team[0].user.id].sort());
    expect(all.filter((u) => u.deactivatedByPlan)).toHaveLength(3);

    // Volver a subir reactiva a los desactivados por plan.
    await app.get(PlanChangeService).applyUpgrade(tid, 'crece');
    expect(
      await users.countDocuments({
        tenantId: new Types.ObjectId(tid),
        isActive: { $ne: false },
      }),
    ).toBe(5);
  });

  it('solo el administrador cambia el plan; sin plan pagado no hay subida', async () => {
    const owner = await registerTenant(app, 'Permisos SAC');
    const agent = await createUser(app, owner, 'MARKETING');
    await http().get('/billing/plan/options').set(bearer(agent)).expect(403);
    await http()
      .post('/billing/plan/cancel')
      .set(bearer(agent))
      .send({})
      .expect(403);
    // En prueba: no hay plan pagado que cambiar.
    await http()
      .post('/billing/plan/upgrade')
      .set(bearer(owner))
      .send({ plan: 'crece' })
      .expect(400);
  });

  it('no se abren dos pagos de subida a la vez; una subida vieja no se aplica', async () => {
    const owner = await registerTenant(app, 'Doble SAC');
    const tid = await paid(owner, 'inicia', 'pre-doble');
    const first = (
      await http()
        .post('/billing/plan/upgrade')
        .set(bearer(owner))
        .send({ plan: 'crece' })
        .expect(201)
    ).body as { session: string; total: number };
    await http()
      .post('/billing/plan/upgrade')
      .set(bearer(owner))
      .send({ plan: 'escala' })
      .expect(409);
    // Mientras tanto se renovó: la diferencia calculada ya no vale.
    await tenants.updateOne(
      { _id: tid },
      {
        $set: {
          'subscription.currentPeriodEnd': new Date(Date.now() + 40 * DAY),
        },
      },
    );
    await app.get(PaymentsService).syncFromMp({
      id: `stale-${++seq}`,
      status: 'approved',
      transaction_amount: first.total,
      currency_id: 'PEN',
      external_reference: first.session,
      payment_type_id: 'credit_card',
      date_approved: new Date().toISOString(),
    });
    await wait();
    expect((await tenants.findById(tid).lean())!.plan).toBe('inicia');
  });

  it('cancelar: si Mercado Pago falla no se marca nada; en impago se cierra ya', async () => {
    const owner = await registerTenant(app, 'Falla SAC');
    const tid = await paid(owner, 'crece', 'pre-falla');
    updatePre.mockRejectedValueOnce(new Error('MP caído'));
    await http()
      .post('/billing/plan/cancel')
      .set(bearer(owner))
      .send({})
      .expect(503);
    expect((await sub(tid)).cancelAtPeriodEnd).toBeFalsy();
    // Una bajada sobre un plan cancelado no se programa.
    await http()
      .post('/billing/plan/cancel')
      .set(bearer(owner))
      .send({})
      .expect(201);
    await http()
      .post('/billing/plan/downgrade')
      .set(bearer(owner))
      .send({ plan: 'inicia' })
      .expect(400);

    const late = await registerTenant(app, 'Impago SAC');
    const lid = await paid(late, 'crece', 'pre-impago');
    await tenants.updateOne(
      { _id: lid },
      { $set: { 'subscription.status': 'past_due' } },
    );
    await http()
      .post('/billing/plan/cancel')
      .set(bearer(late))
      .send({})
      .expect(201);
    const s = await sub(lid);
    expect(s.status).toBe('canceled');
    expect(s.preapprovalsToCancel).toEqual(['pre-impago']);
  });

  it('bajada en pago único: la renovación pagada por adelantado no cambia el plan antes de tiempo', async () => {
    const owner = await registerTenant(app, 'Anual SAC');
    const tid = await paid(owner, 'crece', 'x');
    await tenants.updateOne(
      { _id: tid },
      {
        $set: { 'subscription.period': 'annual', 'subscription.amount': 2490 },
        $unset: { 'subscription.mpPreapprovalId': '' },
      },
    );
    await http()
      .post('/billing/plan/downgrade')
      .set(bearer(owner))
      .send({ plan: 'inicia' })
      .expect(201);
    // Se deshace y se vuelve a programar.
    await http()
      .delete('/billing/plan/downgrade')
      .set(bearer(owner))
      .expect(200);
    expect((await sub(tid)).pendingPlan).toBeUndefined();
    await http()
      .post('/billing/plan/downgrade')
      .set(bearer(owner))
      .send({ plan: 'inicia' })
      .expect(201);
    const end = (await sub(tid)).currentPeriodEnd!;
    // Paga la renovación (al precio de Inicia) 7 días antes del fin.
    await app.get(TenantsService).activatePlan(tid, {
      plan: 'inicia',
      period: 'annual',
      currency: 'PEN',
      amount: 990,
    });
    let t = (await tenants.findById(tid).lean())!;
    expect(t.plan).toBe('crece');
    expect(t.subscription!.pendingPlan).toBe('inicia');
    expect(new Date(t.subscription!.pendingPlanFrom!).getTime()).toBe(
      new Date(end).getTime(),
    );
    // Llega el fin del periodo: entra Inicia.
    expect(
      await app
        .get(PlanChangeService)
        .applyScheduled(new Date(new Date(end).getTime() + 1000)),
    ).toBe(1);
    t = (await tenants.findById(tid).lean())!;
    expect(t.plan).toBe('inicia');
    expect(t.subscription!.pendingPlan).toBeUndefined();
  });
});
