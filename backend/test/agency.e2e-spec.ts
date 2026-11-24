import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import {
  ADMIN,
  bearer,
  createApp,
  login,
  registerTenant,
  type Session,
} from './support/app';

type Client = { _id: string; name: string; usage: { contacts: number } };
type Overview = {
  agency: { seats: number; used: number };
  clients: Client[];
  actingTenantId: string | null;
};
type SessionBody = {
  access_token: string;
  refresh_token: string;
  user: { tenantId: string; homeTenantId?: string };
};
const as = (s: SessionBody): Session =>
  ({
    token: s.access_token,
    refreshToken: s.refresh_token,
    user: s.user,
  }) as unknown as Session;

describe('Plan agencia y marca blanca (HU72, e2e)', () => {
  let app: NestExpressApplication;
  let agency: Session;
  let other: Session;
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    // Con lista blanca de CORS fija, como en producción.
    process.env.CORS_ORIGINS = 'https://app.mayacrm.site';
    app = await createApp();
    delete process.env.CORS_ORIGINS;
    agency = await registerTenant(app, 'Andes Digital');
    other = await registerTenant(app, 'Ajena');
    const admin = await login(app, ADMIN.email, ADMIN.password);
    // Sin plan Agencia no hay panel.
    await api().get('/agency').set(bearer(agency)).expect(403);
    await api()
      .put(`/admin/agency/${agency.user.tenantId}`)
      .set(bearer(agency))
      .send({ seats: 5 })
      .expect(403);
    await api()
      .put(`/admin/agency/${agency.user.tenantId}`)
      .set(bearer(admin))
      .send({ seats: 5 })
      .expect(200);
  });
  afterAll(() => app.close());

  it('C1: el usuario de la agencia ve y entra en sus 5 sub-cuentas y no en otras', async () => {
    for (let i = 1; i <= 5; i++)
      await api()
        .post('/agency/clients')
        .set(bearer(agency))
        .send({
          name: `Cliente ${i} ${Date.now()}`,
          email: `c${i}-${Date.now()}@cli.pe`,
        })
        .expect(201);
    // La sexta pide sub-cuentas extra.
    await api()
      .post('/agency/clients')
      .set(bearer(agency))
      .send({
        name: `Cliente 6 ${Date.now()}`,
        email: `c6-${Date.now()}@cli.pe`,
      })
      .expect(403);

    const ov = (await api().get('/agency').set(bearer(agency)).expect(200))
      .body as Overview;
    expect(ov.agency).toEqual({ ...ov.agency, seats: 5, used: 5 });
    expect(ov.clients).toHaveLength(5);

    // Entra a cada una sin volver a iniciar sesión.
    for (const c of ov.clients) {
      const s = (
        await api()
          .post('/auth/switch-tenant')
          .set(bearer(agency))
          .send({ tenantId: c._id })
          .expect(201)
      ).body as SessionBody;
      expect(s.user).toMatchObject({
        tenantId: c._id,
        homeTenantId: agency.user.tenantId,
      });
    }

    const first = ov.clients[0];
    const inside = as(
      (
        await api()
          .post('/auth/switch-tenant')
          .set(bearer(agency))
          .send({ tenantId: first._id })
          .expect(201)
      ).body as SessionBody,
    );
    // Trabaja dentro del cliente: lo que crea queda en el cliente.
    await api()
      .post('/customers')
      .set(bearer(inside))
      .send({ name: 'Contacto del cliente', email: `x-${Date.now()}@cli.pe` })
      .expect(201);
    const mine = await api().get('/customers').set(bearer(agency)).expect(200);
    expect(
      (mine.body as { name: string }[]).some(
        (c) => c.name === 'Contacto del cliente',
      ),
    ).toBe(false);
    const overview = (
      await api().get('/agency').set(bearer(inside)).expect(200)
    ).body as Overview;
    expect(overview.actingTenantId).toBe(first._id);
    expect(
      overview.clients.find((c) => c._id === first._id)!.usage.contacts,
    ).toBe(1);

    // Renovar la sesión la mantiene en la sub-cuenta.
    const renewed = (
      await api()
        .post('/auth/refresh')
        .send({ refreshToken: inside.refreshToken })
        .expect(201)
    ).body as SessionBody;
    expect(renewed.user.tenantId).toBe(first._id);

    // Vuelve a la agencia.
    const back = (
      await api()
        .post('/auth/switch-tenant')
        .set(bearer(inside))
        .send({ tenantId: agency.user.tenantId })
        .expect(201)
    ).body as SessionBody;
    expect(back.user.tenantId).toBe(agency.user.tenantId);
    expect(back.user.homeTenantId).toBeUndefined();

    // No entra en empresas que no son suyas, ni otra empresa en las suyas.
    await api()
      .post('/auth/switch-tenant')
      .set(bearer(agency))
      .send({ tenantId: other.user.tenantId })
      .expect(403);
    await api()
      .post('/auth/switch-tenant')
      .set(bearer(other))
      .send({ tenantId: first._id })
      .expect(403);
    await api().get('/agency').set(bearer(other)).expect(403);
  });

  it('C2: el panel en el dominio de la agencia muestra su logo y su nombre, sin "Maya"', async () => {
    await api()
      .put('/agency/white-label')
      .set(bearer(agency))
      .send({
        panelDomain: 'http://Crm.Andes.pe/',
        appName: 'Andes CRM',
        logo: 'ftp://x',
      })
      .expect(400);
    await api()
      .put('/agency/white-label')
      .set(bearer(agency))
      .send({
        panelDomain: 'https://Crm.Andes.pe/',
        appName: 'Andes CRM',
        logo: 'https://cdn.andes.pe/logo.png',
        primaryColor: '#0EA5E9',
      })
      .expect(200);
    // Otra agencia no puede tomar el mismo dominio.
    const brand = await api()
      .get('/public/white-label?host=crm.andes.pe')
      .expect(200);
    expect(brand.body).toEqual({
      appName: 'Andes CRM',
      logo: 'https://cdn.andes.pe/logo.png',
      primaryColor: '#0EA5E9',
    });
    expect(JSON.stringify(brand.body)).not.toMatch(/maya/i);
    await api().get('/public/white-label?host=otro.pe').expect(404);

    // El navegador en crm.andes.pe puede hablar con la API (CORS).
    const pre = await api()
      .options('/auth/login')
      .set('Origin', 'https://crm.andes.pe')
      .set('Access-Control-Request-Method', 'POST');
    expect(pre.headers['access-control-allow-origin']).toBe(
      'https://crm.andes.pe',
    );
    const foreign = await api()
      .options('/auth/login')
      .set('Origin', 'https://phishing.pe')
      .set('Access-Control-Request-Method', 'POST');
    expect(foreign.headers['access-control-allow-origin']).toBeUndefined();

    // Dentro de una sub-cuenta, la marca también es la de la agencia.
    const ov = (await api().get('/agency').set(bearer(agency)).expect(200))
      .body as Overview;
    const inside = as(
      (
        await api()
          .post('/auth/switch-tenant')
          .set(bearer(agency))
          .send({ tenantId: ov.clients[1]._id })
          .expect(201)
      ).body as SessionBody,
    );
    const b = await api().get('/agency/brand').set(bearer(inside)).expect(200);
    expect(b.body).toMatchObject({ appName: 'Andes CRM', agency: true });
    const plain = await api()
      .get('/agency/brand')
      .set(bearer(other))
      .expect(200);
    expect(plain.body).toEqual({ appName: 'Maya CRM', agency: false });
  });
});
