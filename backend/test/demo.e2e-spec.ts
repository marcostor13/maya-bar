import type { NestExpressApplication } from '@nestjs/platform-express';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import { Tenant } from '../src/tenants/tenant.schema';
import {
  ADMIN,
  bearer,
  createApp,
  login,
  registerTenant,
  type Session,
} from './support/app';

type ResetBody = {
  tenantId: string;
  email: string;
  password: string;
  users: { email: string }[];
  counts: Record<string, number>;
};
type Leads = { items?: unknown[]; data?: unknown[] } | unknown[];
const size = (b: Leads) =>
  Array.isArray(b) ? b.length : (b.items ?? b.data ?? []).length;

describe('Cuenta demo (HU86, e2e)', () => {
  let app: NestExpressApplication;
  let admin: Session;
  let other: Session;
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createApp();
    admin = await login(app, ADMIN.email, ADMIN.password);
    other = await registerTenant(app, 'Empresa real');
    // La empresa real tiene datos propios: el restablecimiento no debe tocarlos.
    for (const n of [1, 2, 3])
      await request(app.getHttpServer())
        .post('/customers')
        .set(bearer(other))
        .send({ name: `Cliente real ${n}`, phone: `5198765430${n}` })
        .expect(201);
  });
  afterAll(() => app.close());

  it('C6: solo el superadmin puede restablecer la demo', async () => {
    await api().post('/admin/demo/reset').set(bearer(other)).expect(403);
    await api().post('/admin/demo/reset').expect(401);
  });

  it('C1, C3, C5: crea la demo con datos y accesos que funcionan', async () => {
    const res = await api()
      .post('/admin/demo/reset')
      .set(bearer(admin))
      .expect(200);
    const body = res.body as ResetBody;
    expect(body.password).toMatch(/^[A-Za-z2-9]{12}$/);
    expect(body.counts).toMatchObject({
      users: 4,
      agents: 1,
      whatsappAccounts: 1,
    });
    expect(body.counts.customers).toBeGreaterThanOrEqual(30);
    expect(body.counts.conversations).toBeGreaterThanOrEqual(30);
    expect(body.counts.leads).toBeGreaterThanOrEqual(40);

    const tenants = app.get<Model<Tenant>>(getModelToken(Tenant.name));
    const t = await tenants.findById(body.tenantId).lean().exec();
    expect(t).toMatchObject({ demo: true, legacy: true, plan: 'escala' });
    expect(t?.trialEndsAt).toBeUndefined();

    // Los datos se ven a través de la API real con el usuario de la demo.
    const demo = await login(app, body.email, body.password);
    const leads = await api().get('/leads').set(bearer(demo)).expect(200);
    expect(size(leads.body as Leads)).toBeGreaterThan(0);
    const convs = await api()
      .get('/conversations')
      .set(bearer(demo))
      .expect(200);
    expect(size(convs.body as Leads)).toBeGreaterThan(0);
    const customers = await api()
      .get('/customers')
      .set(bearer(demo))
      .expect(200);
    expect(size(customers.body as Leads)).toBeGreaterThan(0);
    // Un vendedor también entra con la misma contraseña.
    await login(app, body.users[1].email, body.password);
  });

  it('C2: restablecer borra la demo anterior, cambia la contraseña y no toca otras empresas', async () => {
    const first = (
      await api().post('/admin/demo/reset').set(bearer(admin)).expect(200)
    ).body as ResetBody;
    const before = await api().get('/customers').set(bearer(other)).expect(200);
    const second = (
      await api().post('/admin/demo/reset').set(bearer(admin)).expect(200)
    ).body as ResetBody;
    expect(second.tenantId).not.toBe(first.tenantId);
    expect(second.password).not.toBe(first.password);

    const tenants = app.get<Model<Tenant>>(getModelToken(Tenant.name));
    expect(await tenants.countDocuments({ demo: true })).toBe(1);
    const db = tenants.db.db!;
    for (const name of [
      'customers',
      'leads',
      'conversations',
      'messages',
      'users',
    ]) {
      const left = await db.collection(name).countDocuments({
        tenantId: {
          $in: [
            first.tenantId,
            new tenants.base.Types.ObjectId(first.tenantId),
          ],
        },
      });
      expect({ name, left }).toEqual({ name, left: 0 });
    }
    // La contraseña anterior ya no entra.
    await api()
      .post('/auth/login')
      .send({ email: first.email, password: first.password })
      .expect(401);
    const after = await api().get('/customers').set(bearer(other)).expect(200);
    expect(size(before.body as Leads)).toBe(3);
    expect(after.body).toEqual(before.body);
    await api()
      .get('/auth/me')
      .set(bearer(other))
      .expect((r) => {
        if (r.status >= 500) throw new Error('la empresa real se rompió');
      });
  });

  it('C2: limpia restos de un restablecimiento que falló a mitad', async () => {
    const tenants = app.get<Model<Tenant>>(getModelToken(Tenant.name));
    const db = tenants.db.db!;
    const ghost = new tenants.base.Types.ObjectId();
    // Estado a medias: su usuario quedó suelto, con una empresa que no existe.
    await db
      .collection('users')
      .deleteMany({ email: 'demo@demo.mayacrm.site' });
    await db.collection('users').insertOne({
      email: 'demo@demo.mayacrm.site',
      tenantId: ghost,
      role: 'TENANT_ADMIN',
    });
    await db.collection('leads').insertOne({ tenantId: ghost, title: 'resto' });
    await api().post('/admin/demo/reset').set(bearer(admin)).expect(200);
    expect(
      await db.collection('users').countDocuments({ tenantId: ghost }),
    ).toBe(0);
    expect(
      await db.collection('leads').countDocuments({ tenantId: ghost }),
    ).toBe(0);
  });

  it('C7: si una empresa real usa el slug de la demo, responde 409 y no borra nada', async () => {
    const tenants = app.get<Model<Tenant>>(getModelToken(Tenant.name));
    const current = await tenants.findOne({ demo: true }).lean().exec();
    // Simula la colisión: la demo actual deja de ser demo.
    await tenants
      .updateOne({ _id: current!._id }, { $unset: { demo: 1 } })
      .exec();
    await api().post('/admin/demo/reset').set(bearer(admin)).expect(409);
    expect(await tenants.exists({ _id: current!._id })).toBeTruthy();
    const db = tenants.db.db!;
    expect(
      await db
        .collection('customers')
        .countDocuments({ tenantId: current!._id }),
    ).toBeGreaterThan(0);
  });
});
