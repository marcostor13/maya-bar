import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { ADMIN, bearer, createApp, login, registerTenant } from './support/app';
import {
  MercadoPagoClient,
  type MpPayment,
} from '../src/billing/mercadopago/mercadopago.client';
import { PaymentsService } from '../src/billing/payments.service';
import { MailService } from '../src/mail/mail.service';
import { Tenant } from '../src/tenants/tenant.schema';
import { User } from '../src/users/user.schema';
import { TenantsService } from '../src/tenants/tenants.service';
import { AccountProvisioningService } from '../src/auth/account-provisioning.service';

type Body = Record<string, unknown>;

const boleta = {
  docType: 'boleta',
  docNumber: '12345678',
  legalName: 'Ana Pérez',
};

let paySeq = 0;
function approved(ref: string, extra: Partial<MpPayment> = {}): MpPayment {
  return {
    id: `pay-${++paySeq}`,
    status: 'approved',
    transaction_amount: 1,
    currency_id: 'PEN',
    external_reference: ref,
    payment_type_id: 'credit_card',
    date_approved: new Date().toISOString(),
    ...extra,
  };
}

/** HU47: alta y acceso automático tras el pago (y ajustes de HU46). */
describe('Alta automática tras el pago (HU47)', () => {
  let app: NestExpressApplication;
  let tenants: Model<Tenant>;
  let users: Model<User>;
  let sendHtml: jest.SpyInstance;
  const http = () => request(app.getHttpServer());

  const lastLink = () => {
    const html = (sendHtml.mock.calls.at(-1) as [{ html: string }])[0].html;
    const m =
      /acceso\?token=([\w-]+)&amp;email=|acceso\?token=([\w-]+)&email=/.exec(
        html,
      );
    return (m?.[1] ?? m?.[2]) as string;
  };

  const buy = async (
    email: string,
    company: string,
    auth?: { token: string },
  ) => {
    const req = http()
      .post(auth ? '/billing/checkout' : '/public/checkout')
      .send({
        plan: 'escala',
        period: 'anual',
        currency: 'PEN',
        buyer: { company, name: 'Ana Pérez', email },
        billing: boleta,
        acceptTerms: true,
      });
    if (auth) void req.set({ Authorization: `Bearer ${auth.token}` });
    return ((await req.expect(201)).body as { session: string }).session;
  };

  beforeAll(async () => {
    process.env.MP_ACCESS_TOKEN = 'TEST-token';
    app = await createApp();
    const mp = app.get(MercadoPagoClient);
    jest
      .spyOn(mp, 'createPreference')
      .mockResolvedValue({ id: 'pref', init_point: 'https://mp.test/pref' });
    sendHtml = jest
      .spyOn(app.get(MailService), 'sendHtml')
      .mockResolvedValue('mock');
    tenants = app.get(getModelToken(Tenant.name));
    users = app.get(getModelToken(User.name));
  });
  afterAll(async () => {
    delete process.env.MP_ACCESS_TOKEN;
    await app.close();
  });

  it('C1 + C2: pago aprobado de un correo nuevo → 1 empresa activa, 1 admin y 1 correo; repetir no duplica', async () => {
    const email = 'nueva-hu47@e2e.test';
    const session = await buy(email, 'Pastelería Nueva');
    sendHtml.mockClear();
    const pays = app.get(PaymentsService);
    const p = approved(session);
    await Promise.all([pays.syncFromMp(p), pays.syncFromMp(p)]);
    // Un segundo cobro aprobado de la misma compra tampoco crea otra empresa.
    await pays.syncFromMp(approved(session));

    expect(await tenants.countDocuments({ email })).toBe(1);
    const tenant = (await tenants.findOne({ email }).lean())!;
    expect(tenant).toMatchObject({
      plan: 'escala',
      subscription: { status: 'active', period: 'annual' },
    });
    expect(tenant.subscription!.currentPeriodEnd!.getTime()).toBeGreaterThan(
      Date.now() + 360 * 86400_000,
    );
    expect(await users.countDocuments({ email })).toBe(1);
    expect(await users.findOne({ email }).lean()).toMatchObject({
      role: 'TENANT_ADMIN',
      emailVerified: true,
      accessPending: true,
    });
    expect(sendHtml).toHaveBeenCalledTimes(1);
    const st = (await http().get(`/public/checkout/${session}`).expect(200))
      .body as Body;
    expect(st.status).toBe('fulfilled');
  });

  it('C3: el enlace sirve una sola vez y vencido ofrece reenviar', async () => {
    const email = 'nueva-hu47@e2e.test';
    // Se pide uno nuevo (el del correo anterior quedó como último enviado).
    await http().post('/auth/access/resend').send({ email }).expect(201);
    const token = lastLink();
    const ok = (
      await http()
        .post('/auth/access')
        .send({ email, token, password: 'Clave-Nueva-123' })
        .expect(201)
    ).body as Body;
    expect(ok.access_token).toBeTruthy();
    await login(app, email, 'Clave-Nueva-123');
    const reuse = await http()
      .post('/auth/access')
      .send({ email, token, password: 'Otra-Clave-123' })
      .expect(400);
    expect((reuse.body as Body).code).toBe('ACCESS_LINK_INVALID');
    // Con contraseña ya creada, "reenviar" no manda nada.
    sendHtml.mockClear();
    await http().post('/auth/access/resend').send({ email }).expect(201);
    expect(sendHtml).not.toHaveBeenCalled();
  });

  it('C3: un enlace vencido (72 h) no sirve', async () => {
    const email = 'vence-hu47@e2e.test';
    const session = await buy(email, 'Vence SAC');
    await app.get(PaymentsService).syncFromMp(approved(session));
    const token = lastLink();
    await users.updateOne(
      { email },
      { $set: { accessTokenExpires: new Date(Date.now() - 1000) } },
    );
    await http()
      .post('/auth/access')
      .send({ email, token, password: 'Clave-Nueva-123' })
      .expect(400);
    sendHtml.mockClear();
    await http().post('/auth/access/resend').send({ email }).expect(201);
    expect(sendHtml).toHaveBeenCalledTimes(1);
    await http()
      .post('/auth/access')
      .send({ email, token: lastLink(), password: 'Clave-Nueva-123' })
      .expect(201);
  });

  it('C4: una cuenta en prueba que paga desde su cuenta conserva sus datos y pasa a active', async () => {
    const owner = await registerTenant(app, 'En Prueba');
    const before = await tenants.countDocuments();
    const session = await buy(owner.email, 'En Prueba', owner);
    await app.get(PaymentsService).syncFromMp(approved(session));
    expect(await tenants.countDocuments()).toBe(before);
    const t = (await tenants.findById(owner.user.tenantId).lean())!;
    expect(t.subscription).toMatchObject({
      status: 'active',
      period: 'annual',
    });
    expect(t.plan).toBe('escala');
  });

  it('mismo correo con su empresa en prueba que paga sin sesión: se activa la suya', async () => {
    const owner = await registerTenant(app, 'Sin Sesion');
    const before = await tenants.countDocuments();
    const session = await buy(owner.email, 'Otra Cosa');
    await app.get(PaymentsService).syncFromMp(approved(session));
    expect(await tenants.countDocuments()).toBe(before);
    expect(
      (await tenants.findById(owner.user.tenantId).lean())!.subscription!
        .status,
    ).toBe('active');
  });

  it('correo de otro rol (superadmin): empresa nueva sin mezclar y aviso al superadmin', async () => {
    const before = await tenants.countDocuments();
    sendHtml.mockClear();
    const session = await buy(ADMIN.email, 'Empresa Ajena');
    await app.get(PaymentsService).syncFromMp(approved(session));
    expect(await tenants.countDocuments()).toBe(before + 1);
    expect(
      await users.countDocuments({ email: ADMIN.email.toLowerCase() }),
    ).toBe(1);
    const subjects = sendHtml.mock.calls.map(
      (c) => (c as [{ subject: string }])[0].subject,
    );
    expect(subjects.some((s) => s.startsWith('Revisar alta'))).toBe(true);
  });

  it('HU46: solo el administrador de la empresa compra desde la cuenta; Empresa no se vende en línea', async () => {
    const admin = await login(app, ADMIN.email, ADMIN.password);
    await http()
      .post('/billing/checkout')
      .set(bearer(admin))
      .send({
        plan: 'inicia',
        period: 'anual',
        currency: 'PEN',
        buyer: { company: 'Xyz SAC', name: 'Ana', email: 'x@e2e.test' },
        billing: boleta,
        acceptTerms: true,
      })
      .expect(403);
    await http()
      .post('/public/checkout')
      .send({
        plan: 'empresa',
        period: 'anual',
        currency: 'PEN',
        buyer: { company: 'Xyz SAC', name: 'Ana', email: 'x@e2e.test' },
        billing: boleta,
        acceptTerms: true,
      })
      .expect(400);
  });

  it('HU46: un aviso "pendiente" tardío no hace retroceder una compra pagada', async () => {
    const owner = await registerTenant(app, 'Orden');
    const session = await buy(owner.email, 'Orden', owner);
    const pays = app.get(PaymentsService);
    const id = `late-${session}`;
    // Primero llega "pendiente" de otro intento, luego el aprobado; después un pendiente viejo.
    await pays.syncFromMp(approved(session, { id }));
    await pays.syncFromMp(
      approved(session, { id: `${id}-b`, status: 'pending' }),
    );
    const st = (await http().get(`/public/checkout/${session}`).expect(200))
      .body as Body;
    expect(st.status).toBe('fulfilled');
  });

  it('A1: si falla el correo de acceso, el reintento no suma otro periodo y el correo sí llega', async () => {
    const email = 'falla-correo@e2e.test';
    const session = await buy(email, 'Falla Correo');
    sendHtml.mockRejectedValueOnce(new Error('Resend caído'));
    await expect(
      app.get(PaymentsService).syncFromMp(approved(session)),
    ).rejects.toThrow('Resend caído');
    const end1 = (await tenants.findOne({ email }).lean())!.subscription!
      .currentPeriodEnd!;
    sendHtml.mockClear();
    await app.get(AccountProvisioningService).resumePending();
    expect(await tenants.countDocuments({ email })).toBe(1);
    const end2 = (await tenants.findOne({ email }).lean())!.subscription!
      .currentPeriodEnd!;
    expect(end2.getTime()).toBe(end1.getTime());
    expect(sendHtml).toHaveBeenCalledTimes(1);
    const st = (await http().get(`/public/checkout/${session}`).expect(200))
      .body as Body;
    expect(st.status).toBe('fulfilled');
  });

  it('A2: si falla tras crear la empresa, el reintento no crea "Empresa 2"', async () => {
    const email = 'falla-alta@e2e.test';
    const session = await buy(email, 'Falla Alta');
    const svc = app.get(TenantsService);
    const spy = jest
      .spyOn(svc, 'activatePlan')
      .mockRejectedValueOnce(new Error('Mongo caído'));
    await expect(
      app.get(PaymentsService).syncFromMp(approved(session)),
    ).rejects.toThrow('Mongo caído');
    spy.mockRestore();
    await app.get(AccountProvisioningService).resumePending();
    expect(await tenants.countDocuments({ name: /^Falla Alta/ })).toBe(1);
    expect(
      (await tenants.findOne({ email }).lean())!.subscription!.status,
    ).toBe('active');
    expect(await users.countDocuments({ email })).toBe(1);
  });

  it('M2: el mismo enlace canjeado dos veces a la vez solo funciona una', async () => {
    const email = 'doble-canje@e2e.test';
    const session = await buy(email, 'Doble Canje');
    await app.get(PaymentsService).syncFromMp(approved(session));
    const token = lastLink();
    const res = await Promise.all([
      http()
        .post('/auth/access')
        .send({ email, token, password: 'Clave-Uno-123' }),
      http()
        .post('/auth/access')
        .send({ email, token, password: 'Clave-Dos-123' }),
    ]);
    expect(res.map((r) => r.status).sort()).toEqual([201, 400]);
  });

  it('un registro sin confirmar con el mismo correo se descarta y el alta sigue', async () => {
    const email = 'sin-confirmar@e2e.test';
    const owner = await registerTenant(app, 'Sin Confirmar');
    // Simula un registro que nunca confirmó su correo.
    await users.updateOne(
      { email: owner.email },
      { $set: { email, emailVerified: false } },
    );
    await tenants.updateOne({ _id: owner.user.tenantId }, { $set: { email } });
    const session = await buy(email, 'Confirmada SAC');
    await app.get(PaymentsService).syncFromMp(approved(session));
    expect(await tenants.findById(owner.user.tenantId)).toBeNull();
    expect(await users.findOne({ email }).lean()).toMatchObject({
      emailVerified: true,
      accessPending: true,
    });
  });

  it('los campos del enlace nunca salen por la API', async () => {
    const owner = await registerTenant(app, 'Listado');
    await users.updateOne(
      { email: owner.email },
      { $set: { accessTokenHash: 'h', accessPending: true } },
    );
    const list = (await http().get('/users').set(bearer(owner)).expect(200))
      .body as Body[];
    expect(JSON.stringify(list)).not.toContain('accessTokenHash');
  });
});
