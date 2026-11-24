import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { Tenant } from '../src/tenants/tenant.schema';
import { Payment } from '../src/billing/payment.schema';
import {
  bearer,
  createApp,
  createUser,
  registerTenant,
  type Session,
} from './support/app';

type Body = Record<string, unknown>;

/** HU44: Mi plan y consumo por HTTP. */
describe('Mi plan y consumo (HU44)', () => {
  let app: NestExpressApplication;
  let owner: Session;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createApp();
    owner = await registerTenant(app, 'Mi Plan');
    await app
      .get<Model<Tenant>>(getModelToken(Tenant.name))
      .updateOne(
        { _id: owner.user.tenantId },
        { $set: { plan: 'inicia', subscription: { status: 'active' } } },
      );
  });
  afterAll(async () => {
    await app.close();
  });

  it('C1: uso y límites reales del plan y saldo de créditos', async () => {
    const body = (
      await http().get('/billing/usage').set(bearer(owner)).expect(200)
    ).body as Body;
    const users = (body.resources as { key: string }[]).find(
      (r: { key: string }) => r.key === 'users',
    );
    expect(users).toEqual({ key: 'users', limit: 2, used: 1 });
    expect(body.credits).toMatchObject({ included: 500, remaining: 500 });
  });

  it('C2: historial de pagos de la propia empresa con su comprobante', async () => {
    const payments = app.get<Model<Payment>>(getModelToken(Payment.name));
    await payments.create([
      {
        tenantId: new Types.ObjectId(owner.user.tenantId),
        concept: 'Plan Inicia mensual',
        amount: 116.82,
        status: 'approved',
        paidAt: new Date(),
        receipt: { pdfUrl: 'https://x/b.pdf', xmlUrl: 'https://x/b.xml' },
      },
      // De otra empresa: no debe salir.
      {
        tenantId: new Types.ObjectId(),
        concept: 'Ajeno',
        amount: 1,
        paidAt: new Date(),
      },
    ]);
    const body = (
      await http().get('/billing/payments').set(bearer(owner)).expect(200)
    ).body as Body;
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      concept: 'Plan Inicia mensual',
      receipt: { pdfUrl: 'https://x/b.pdf' },
    });
  });

  it('C5: factura exige RUC; boleta con DNI se guarda', async () => {
    await http()
      .put('/billing/info')
      .set(bearer(owner))
      .send({
        docType: 'factura',
        docNumber: '12345678',
        legalName: 'Acme',
        address: 'Lima',
      })
      .expect(400);
    await http()
      .put('/billing/info')
      .set(bearer(owner))
      .send({
        docType: 'factura',
        docNumber: '20123456786',
        legalName: 'Acme SAC',
        address: '   ',
      })
      .expect(400);
    await http()
      .put('/billing/info')
      .set(bearer(owner))
      .send({
        docType: 'boleta',
        docNumber: '12345678',
        legalName: 'Ana Pérez',
        email: 'ANA@x.pe',
      })
      .expect(200);
    const body = (
      await http().get('/billing/info').set(bearer(owner)).expect(200)
    ).body as Body;
    expect(body).toMatchObject({
      docType: 'boleta',
      docNumber: '12345678',
      email: 'ana@x.pe',
    });
  });

  it('C3: quien no es administrador recibe 403', async () => {
    const manager = await createUser(app, owner, 'MANAGER');
    await http().get('/billing/usage').set(bearer(manager)).expect(403);
    await http().get('/billing/payments').set(bearer(manager)).expect(403);
    await http().get('/billing/info').set(bearer(manager)).expect(403);
    await http()
      .put('/billing/info')
      .set(bearer(manager))
      .send({ docType: 'boleta', docNumber: '12345678', legalName: 'X' })
      .expect(403);
  });
});
