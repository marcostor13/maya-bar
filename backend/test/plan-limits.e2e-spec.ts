import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { getModelToken } from '@nestjs/mongoose';
import { Types, type Model } from 'mongoose';
import { Tenant } from '../src/tenants/tenant.schema';
import { Local } from '../src/locals/local.schema';
import {
  bearer,
  createApp,
  createUser,
  registerTenant,
  type Session,
} from './support/app';

/** HU42: límites del plan Inicia aplicados por HTTP. */
describe('Límites por plan (HU42)', () => {
  let app: NestExpressApplication;
  let owner: Session;
  let localId: string;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createApp();
    owner = await registerTenant(app, 'Plan Inicia');
    const tenantId = owner.user.tenantId!;
    await app
      .get<Model<Tenant>>(getModelToken(Tenant.name))
      .updateOne(
        { _id: tenantId },
        { $set: { plan: 'inicia', subscription: { status: 'active' } } },
      );
    const local = await app
      .get<Model<Local>>(getModelToken(Local.name))
      .create({
        tenantId: new Types.ObjectId(tenantId),
        name: 'Sede',
      });
    localId = String(local._id);
  });
  afterAll(async () => {
    await app.close();
  });

  it('C1: en Inicia el 3.er usuario da 402 PLAN_LIMIT', async () => {
    await createUser(app, owner, 'MANAGER'); // 2.º (el dueño es el 1.º)
    const res = await http()
      .post('/users')
      .set(bearer(owner))
      .send({
        name: 'Tercero',
        email: `tercero-${Date.now()}@e2e.test`,
        role: 'MANAGER',
      })
      .expect(402);
    expect(res.body).toMatchObject({
      code: 'PLAN_LIMIT',
      resource: 'users',
      limit: 2,
    });
  });

  it('C3: con un add-on de +1 usuario el 3.º se crea', async () => {
    await app
      .get<Model<Tenant>>(getModelToken(Tenant.name))
      .updateOne(
        { _id: owner.user.tenantId },
        { $set: { addons: { users: 1 } } },
      );
    await createUser(app, owner, 'MARKETING');
  });

  it('C1: reactivar un usuario por encima del límite también da 402', async () => {
    const tenants = app.get<Model<Tenant>>(getModelToken(Tenant.name));
    await tenants.updateOne(
      { _id: owner.user.tenantId },
      { $unset: { addons: 1 } },
    );
    const list = await http().get('/users').set(bearer(owner)).expect(200);
    const others = (list.body as { _id: string; role: string }[]).filter(
      (u) => u.role !== 'TENANT_ADMIN',
    );
    // Con 3 activos y límite 2, desactivar uno deja 2 y reactivarlo pasaría a 3.
    await http()
      .patch(`/users/${others[0]._id}`)
      .set(bearer(owner))
      .send({ isActive: false })
      .expect(200);
    const res = await http()
      .patch(`/users/${others[0]._id}`)
      .set(bearer(owner))
      .send({ isActive: true })
      .expect(402);
    expect(res.body).toMatchObject({ code: 'PLAN_LIMIT', resource: 'users' });
  });

  it('C5: en Inicia crear una campaña de WhatsApp da 402 PLAN_FEATURE', async () => {
    const res = await http()
      .post('/campaigns')
      .set(bearer(owner))
      .send({ name: 'Promo', type: 'whatsapp' })
      .expect(402);
    expect(res.body).toMatchObject({
      code: 'PLAN_FEATURE',
      feature: 'whatsapp-campaigns',
    });
  });

  it('C2: publicar un 2.º evento da 402; el borrador sí se guarda', async () => {
    const event = (status: string, n: number) => ({
      title: `Evento ${n}`,
      date: '2030-01-01T20:00:00.000Z',
      localId,
      status,
    });
    await http()
      .post('/events')
      .set(bearer(owner))
      .send(event('published', 1))
      .expect(201);
    const res = await http()
      .post('/events')
      .set(bearer(owner))
      .send(event('published', 2))
      .expect(402);
    expect(res.body).toMatchObject({
      code: 'PLAN_LIMIT',
      resource: 'activeEvents',
    });
    await http()
      .post('/events')
      .set(bearer(owner))
      .send(event('draft', 3))
      .expect(201);
  });
});
