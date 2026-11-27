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

  describe('solo lectura (HU88)', () => {
    let body: ResetBody;
    let demo: Session;
    beforeAll(async () => {
      // C7 deja la demo anterior sin la marca: se la devolvemos para poder restablecer.
      const tenants = app.get<Model<Tenant>>(getModelToken(Tenant.name));
      await tenants
        .updateOne({ slug: 'maya-demo' }, { $set: { demo: true } })
        .exec();
      body = (
        await api().post('/admin/demo/reset').set(bearer(admin)).expect(200)
      ).body as ResetBody;
      demo = await login(app, body.email, body.password);
    });

    it('C1: la demo no puede crear datos', async () => {
      const before = size(
        (await api().get('/customers').set(bearer(demo)).expect(200))
          .body as Leads,
      );
      const res = await api()
        .post('/customers')
        .set(bearer(demo))
        .send({ name: 'Intruso', phone: '51911111111' })
        .expect(403);
      expect((res.body as { code: string }).code).toBe('DEMO_READ_ONLY');
      const after = size(
        (await api().get('/customers').set(bearer(demo)).expect(200))
          .body as Leads,
      );
      expect(after).toBe(before);
    });

    it('C2: no puede cambiar la contraseña ni crear usuarios; la clave sigue sirviendo', async () => {
      await api()
        .patch('/auth/change-password')
        .set(bearer(demo))
        .send({ currentPassword: body.password, newPassword: 'OtraClave-123' })
        .expect(403);
      await api()
        .post('/users')
        .set(bearer(demo))
        .send({
          name: 'Nuevo',
          email: 'nuevo@x.pe',
          password: 'Clave-Segura-1',
          role: 'AGENT',
        })
        .expect(403);
      await login(app, body.email, body.password);
    });

    it('C3: puede ver todo', async () => {
      const res = await api().get('/customers').set(bearer(demo)).expect(200);
      expect(size(res.body as Leads)).toBeGreaterThan(0);
      const status = await api()
        .get('/billing/status')
        .set(bearer(demo))
        .expect(200);
      expect(status.body).toMatchObject({ demo: true });
    });

    it('C4, C5: el superadmin restablece y otra empresa escribe normal', async () => {
      await api().post('/admin/demo/reset').set(bearer(admin)).expect(200);
      await api()
        .post('/customers')
        .set(bearer(other))
        .send({ name: 'Cliente real 4', phone: '51987654304' })
        .expect(201);
    });
  });

  it('HU89: todas las pantallas de la demo tienen datos y nada queda pendiente de enviar', async () => {
    const tenants = app.get<Model<Tenant>>(getModelToken(Tenant.name));
    await tenants
      .updateOne({ slug: 'maya-demo' }, { $set: { demo: true } })
      .exec();
    const body = (
      await api().post('/admin/demo/reset').set(bearer(admin)).expect(200)
    ).body as ResetBody;
    for (const m of [
      'Campaign',
      'CampaignRecipient',
      'WaTemplate',
      'MessageTemplate',
      'EmailTemplate',
      'ShortLink',
      'LinkClick',
      'ContactForm',
      'FormSubmission',
      'ContactList',
      'Automation',
      'AutomationRun',
      'RecoveryPlan',
      'Prospect',
      'Quote',
      'Call',
      'SuppressionEntry',
      'RoutingRule',
      'ContactActivity',
      'LeadActivity',
      'Report',
      'AuditEntry',
      'KnowledgeDoc',
    ])
      expect({ m, n: body.counts[m] > 0 }).toEqual({ m, n: true });

    const demo = await login(app, body.email, body.password);
    type LeadRow = { _id: string; stage: string };
    const raw = (await api().get('/leads').set(bearer(demo)).expect(200))
      .body as LeadRow[] | { items?: LeadRow[] };
    const leads: LeadRow[] = Array.isArray(raw) ? raw : (raw.items ?? []);
    const won = leads.find((l) => l.stage === 'won');
    for (const path of [
      '/campaigns',
      '/automations',
      '/recovery',
      '/links',
      '/email-templates',
      '/message-templates',
      '/whatsapp-templates',
      '/forms',
      '/lists',
      '/prospecting/searches',
      '/prospecting/prospects',
      '/calls',
      '/suppression',
      '/reports',
      '/routing/rules',
      '/routing/log',
      '/audit',
      '/products',
      ...(won ? [`/quotes?leadId=${won._id}`] : []),
    ]) {
      const res = await api().get(path).set(bearer(demo));
      expect({ path, status: res.status }).toEqual({ path, status: 200 });
      expect({ path, empty: size(res.body as Leads) === 0 }).toEqual({
        path,
        empty: false,
      });
    }
    const analytics = await api()
      .get('/dashboard/analytics')
      .set(bearer(demo))
      .expect(200);
    expect(JSON.stringify(analytics.body)).toContain('instagram');

    // Nada que los procesos en segundo plano puedan tomar y enviar.
    const db = tenants.db.db!;
    const tid = new tenants.base.Types.ObjectId(body.tenantId);
    const pending = {
      campaigns: await db.collection('campaigns').countDocuments({
        tenantId: tid,
        status: { $in: ['scheduled', 'sending'] },
      }),
      runs: await db
        .collection('automation_runs')
        .countDocuments({ tenantId: tid, status: 'active' }),
      recovery: await db.collection('recoveryplans').countDocuments({
        tenantId: tid,
        status: { $in: ['analyzing', 'scheduled', 'sending'] },
      }),
      searches: await db
        .collection('prospectsearches')
        .countDocuments({ tenantId: tid, status: 'searching' }),
      calls: await db.collection('calls').countDocuments({
        tenantId: tid,
        status: { $in: ['ringing', 'connecting', 'active'] },
      }),
    };
    expect(pending).toEqual({
      campaigns: 0,
      runs: 0,
      recovery: 0,
      searches: 0,
      calls: 0,
    });
  });
});
