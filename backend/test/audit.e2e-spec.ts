import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import {
  ADMIN,
  bearer,
  createApp,
  createUser,
  login,
  registerTenant,
  type Session,
} from './support/app';

interface Entry {
  action: string;
  actorEmail?: string;
  userId?: string;
  tenantId?: string;
  success: boolean;
  details?: Record<string, unknown>;
  resourceId?: string;
  createdAt: string;
}
interface Page {
  items: Entry[];
  total: number;
}

/** El registro se escribe sin esperar a la respuesta: se reintenta un momento. */
async function waitFor<T>(
  fn: () => Promise<T | undefined>,
  ms = 3000,
): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v !== undefined) return v;
    if (Date.now() > until)
      throw new Error('No apareció el registro de auditoría');
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('Registro de actividad (HU63)', () => {
  let app: NestExpressApplication;
  let root: Session;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createApp();
    root = await login(app, ADMIN.email, ADMIN.password);
  });
  afterAll(async () => {
    await app.close();
  });

  const find = (s: Session, action: string, extra = '') =>
    waitFor(async () => {
      const r = await http()
        .get(`/audit?action=${action}${extra}`)
        .set(bearer(s))
        .expect(200);
      const items = (r.body as Page).items;
      return items.length ? items : undefined;
    });

  it('C1: exportar los contactos deja registro con el usuario, la cantidad y la fecha', async () => {
    const owner = await registerTenant(app, 'Auditada');
    for (const name of ['Ana', 'Beto', 'Caro'])
      await http()
        .post('/customers')
        .set(bearer(owner))
        .send({
          name,
          phone: `+5199900${Math.floor(Math.random() * 9000 + 1000)}`,
        })
        .expect(201);

    const before = Date.now();
    await http().get('/customers/export.csv').set(bearer(owner)).expect(200);
    const [e] = await find(owner, 'customers.export');
    expect(e.actorEmail).toBe(owner.email);
    expect(e.userId).toBe(String(owner.user.id));
    expect(e.details).toMatchObject({ rows: 3 });
    expect(new Date(e.createdAt).getTime()).toBeGreaterThanOrEqual(
      before - 1000,
    );

    // CSV del propio registro (y queda registrada la exportación).
    const csv = await http()
      .get('/audit/export.csv')
      .set(bearer(owner))
      .expect(200);
    expect(csv.text).toContain('customers.export');
    await find(owner, 'audit.export');
  });

  it('C2: un usuario de una empresa no ve los registros de otra; solo el administrador los ve', async () => {
    const a = await registerTenant(app, 'Empresa A');
    const b = await registerTenant(app, 'Empresa B');
    await http().get('/customers/export.csv').set(bearer(a)).expect(200);
    await find(a, 'customers.export');

    const rb = await http().get('/audit').set(bearer(b)).expect(200);
    expect(
      (rb.body as Page).items.every((x) => x.tenantId === b.user.tenantId),
    ).toBe(true);
    expect((rb.body as Page).items.some((x) => x.actorEmail === a.email)).toBe(
      false,
    );
    // Ni forzando el filtro de empresa.
    const forced = await http()
      .get(`/audit?tenantId=${a.user.tenantId}`)
      .set(bearer(b))
      .expect(200);
    expect(
      (forced.body as Page).items.some((x) => x.tenantId === a.user.tenantId),
    ).toBe(false);
    const csv = await http()
      .get('/audit/export.csv')
      .set(bearer(b))
      .expect(200);
    expect(csv.text).not.toContain(a.email);

    const manager = await createUser(app, a, 'MANAGER');
    await http().get('/audit').set(bearer(manager)).expect(403);

    // El superadmin ve todo y filtra por empresa.
    const all = await http()
      .get(`/audit?tenantId=${a.user.tenantId}&action=customers.export`)
      .set(bearer(root))
      .expect(200);
    expect((all.body as Page).items.length).toBeGreaterThan(0);
  });

  it('registra inicios de sesión correctos y fallidos, cambios de usuarios y acciones del superadmin', async () => {
    const owner = await registerTenant(app, 'Sesiones');
    await http()
      .post('/auth/login')
      .send({ email: owner.email, password: 'mala-clave' })
      .expect(401);
    await http()
      .post('/auth/login')
      .send({ email: owner.email, password: owner.password })
      .expect(201);
    const failed = await find(owner, 'auth.login_failed');
    expect(failed[0]).toMatchObject({
      success: false,
      actorEmail: owner.email,
      details: { reason: 'bad_credentials' },
    });
    expect(JSON.stringify(failed[0])).not.toContain('mala-clave');
    await find(owner, 'auth.login');

    const created = await http()
      .post('/users')
      .set(bearer(owner))
      .send({
        name: 'Vendedor',
        email: `v-${Date.now()}@e2e.test`,
        role: 'MANAGER',
      })
      .expect(201);
    const [u] = await find(owner, 'users.created');
    expect(u.details).toMatchObject({ role: 'MANAGER' });
    expect(JSON.stringify(u)).not.toContain(
      (created.body as { tempPassword: string }).tempPassword,
    );

    // Acción del superadmin sobre la empresa: la empresa la ve en su registro.
    await http()
      .patch(`/tenants/${owner.user.tenantId}`)
      .set(bearer(root))
      .send({ plan: 'crece' })
      .expect(200);
    const [adm] = await find(owner, 'admin.tenants.updated');
    expect(adm).toMatchObject({
      actorEmail: ADMIN.email,
      tenantId: owner.user.tenantId,
      details: { plan: 'crece' },
    });

    const byEmail = await http()
      .get(`/audit?email=${encodeURIComponent(owner.email.slice(0, 8))}`)
      .set(bearer(owner))
      .expect(200);
    expect((byEmail.body as Page).items.length).toBeGreaterThan(0);
    expect(
      (byEmail.body as Page).items.every((x) =>
        x.actorEmail?.includes(owner.email.slice(0, 8)),
      ),
    ).toBe(true);

    const actions = await http()
      .get('/audit/actions')
      .set(bearer(owner))
      .expect(200);
    expect(actions.body).toEqual(
      expect.arrayContaining(['auth.login', 'users.created']),
    );
  });
});
