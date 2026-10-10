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

type Doc = { _id: string } & Record<string, unknown>;

describe('Empresas, eventos, campañas y entradas públicas (e2e)', () => {
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

  describe('administración de empresas (superadmin)', () => {
    it('crea una empresa con credenciales temporales que funcionan', async () => {
      const res = await http()
        .post('/tenants')
        .set(bearer(root))
        .send({ name: 'Cliente Nuevo SAC', email: 'nuevo@cliente-sac.pe' })
        .expect(201);
      const { tenant, credentials } = res.body as {
        tenant: Doc;
        credentials: { email: string; password: string };
      };
      expect(tenant.name).toBe('Cliente Nuevo SAC');

      const admin = await login(app, credentials.email, credentials.password);
      expect(admin.user.role).toBe('TENANT_ADMIN');
      expect(admin.user.tenantId).toBe(tenant._id);

      const all = await http().get('/tenants').set(bearer(root)).expect(200);
      expect((all.body as Doc[]).map((t) => t._id)).toContain(tenant._id);
    });

    it('no permite dos empresas con el mismo correo', async () => {
      const body = { name: 'Duplicada Uno', email: 'dup@cliente.pe' };
      await http().post('/tenants').set(bearer(root)).send(body).expect(201);
      await http()
        .post('/tenants')
        .set(bearer(root))
        .send({ ...body, name: 'Duplicada Dos' })
        .expect(409);
    });

    it('cambia el plan de una empresa', async () => {
      const owner = await registerTenant(app, 'Plan');
      const res = await http()
        .patch(`/tenants/${owner.user.tenantId}`)
        .set(bearer(root))
        .send({ plan: 'pro' })
        .expect(200);
      expect((res.body as Doc).plan).toBe('pro');

      await http()
        .patch(`/tenants/${owner.user.tenantId}`)
        .set(bearer(root))
        .send({ plan: 'inventado' })
        .expect(400);
    });

    it('eliminar una empresa borra también sus datos y sus accesos', async () => {
      const owner = await registerTenant(app, 'Efímera');
      const survivor = await registerTenant(app, 'Permanente');
      await http()
        .post('/customers')
        .set(bearer(owner))
        .send({ name: 'Se va con la empresa' })
        .expect(201);
      const kept = (
        await http()
          .post('/customers')
          .set(bearer(survivor))
          .send({ name: 'Se queda' })
          .expect(201)
      ).body as Doc;

      await http()
        .delete(`/tenants/${owner.user.tenantId}`)
        .set(bearer(root))
        .expect(200);

      await http()
        .post('/auth/login')
        .send({ email: owner.email, password: owner.password })
        .expect(401);
      // El borrado en cascada no toca a las demás empresas.
      const others = await http()
        .get('/customers')
        .set(bearer(survivor))
        .expect(200);
      expect((others.body as Doc[]).map((c) => c._id)).toContain(kept._id);
    });

    it('una empresa no administra a las demás ni se sube de plan', async () => {
      const owner = await registerTenant(app, 'Curiosa');
      const victim = await registerTenant(app, 'Víctima');

      await http().get('/tenants').set(bearer(owner)).expect(403);
      await http()
        .post('/tenants')
        .set(bearer(owner))
        .send({ name: 'Otra', email: 'otra@cliente.pe' })
        .expect(403);
      await http()
        .patch(`/tenants/${victim.user.tenantId}`)
        .set(bearer(owner))
        .send({ name: 'Secuestrada' })
        .expect(403);
      await http()
        .delete(`/tenants/${victim.user.tenantId}`)
        .set(bearer(owner))
        .expect(403);

      // Sus datos de contacto sí; el plan y el estado no.
      await http()
        .patch('/tenants/me')
        .set(bearer(owner))
        .send({ phone: '+51 900 000 000', plan: 'enterprise', isActive: false })
        .expect(200);
      const me = await http().get('/tenants/me').set(bearer(owner)).expect(200);
      expect((me.body as Doc).phone).toBe('+51 900 000 000');
      expect((me.body as Doc).plan).not.toBe('enterprise');
      expect((me.body as Doc).isActive).not.toBe(false);

      const marketing = await createUser(app, owner, 'MARKETING');
      await http()
        .patch('/tenants/me')
        .set(bearer(marketing))
        .send({ name: 'Renombrada' })
        .expect(403);
    });
  });

  describe('locales y eventos', () => {
    let owner: Session;
    let local: Doc;

    beforeAll(async () => {
      owner = await registerTenant(app, 'Eventos');
      local = (
        await http()
          .post('/locals')
          .set(bearer(owner))
          .send({ name: 'Sede Central', type: 'bar', tableCount: 12 })
          .expect(201)
      ).body as Doc;
    });

    it('edita y lista el local', async () => {
      await http()
        .patch(`/locals/${local._id}`)
        .set(bearer(owner))
        .send({ address: 'Av. Siempre Viva 123' })
        .expect(200);
      const list = await http().get('/locals').set(bearer(owner)).expect(200);
      const found = (list.body as Doc[]).find((l) => l._id === local._id);
      expect(found?.address).toBe('Av. Siempre Viva 123');
    });

    it('un evento en borrador no es público; publicado admite inscripciones', async () => {
      const event = (
        await http()
          .post('/events')
          .set(bearer(owner))
          .send({
            localId: local._id,
            title: 'Noche de Jazz',
            date: '2030-05-20',
            capacity: 50,
          })
          .expect(201)
      ).body as Doc & { slug: string };
      expect(event.slug).toBeTruthy();

      await http().get(`/public/events/${event.slug}`).expect(404);

      await http()
        .patch(`/events/${event._id}`)
        .set(bearer(owner))
        .send({ status: 'published' })
        .expect(200);

      const pub = await http().get(`/public/events/${event.slug}`).expect(200);
      expect(JSON.stringify(pub.body)).toContain('Noche de Jazz');

      await http()
        .post(`/public/events/${event._id}/register`)
        .send({ name: 'Invitada Uno', email: 'no-es-email' })
        .expect(400);
      await http()
        .post(`/public/events/${event._id}/register`)
        .send({ name: 'Invitada Uno', email: 'invitada@cliente.pe' })
        .expect(201);

      const regs = await http()
        .get(`/events/${event._id}/registrations`)
        .set(bearer(owner))
        .expect(200);
      expect(JSON.stringify(regs.body)).toContain('invitada@cliente.pe');
    });

    it('otra empresa no ve ni toca el evento', async () => {
      const event = (
        await http()
          .post('/events')
          .set(bearer(owner))
          .send({ localId: local._id, title: 'Privado', date: '2030-06-01' })
          .expect(201)
      ).body as Doc;
      const intruder = await registerTenant(app, 'Intrusa');

      const res = await http()
        .get(`/events/${event._id}`)
        .set(bearer(intruder));
      expect([403, 404]).toContain(res.status);
      const del = await http()
        .delete(`/events/${event._id}`)
        .set(bearer(intruder));
      expect([403, 404]).toContain(del.status);

      await http().get(`/events/${event._id}`).set(bearer(owner)).expect(200);
    });
  });

  describe('campañas', () => {
    it('guarda un borrador, calcula su audiencia y no envía nada por sí sola', async () => {
      const owner = await registerTenant(app, 'Campañas');
      for (const [name, email] of [
        ['Con Correo', 'con.correo@cliente.pe'],
        ['Sin Correo', undefined],
      ] as const)
        await http()
          .post('/customers')
          .set(bearer(owner))
          .send({ name, email, tags: ['promo'] })
          .expect(201);

      const preview = await http()
        .post('/campaigns/audience-preview')
        .set(bearer(owner))
        .send({ type: 'email', targeting: 'tags', recipientTags: ['promo'] })
        .expect(200);
      // Solo cuenta a quien tiene correo: el canal manda.
      expect(JSON.stringify(preview.body)).toMatch(/\b1\b/);

      const campaign = (
        await http()
          .post('/campaigns')
          .set(bearer(owner))
          .send({
            name: 'Promo de mayo',
            type: 'email',
            subject: 'Hola {{nombre}}',
            body: 'Tenemos una oferta',
            targeting: 'tags',
            recipientTags: ['promo'],
          })
          .expect(201)
      ).body as Doc;
      expect(campaign.status).toBe('draft');

      const list = await http()
        .get('/campaigns')
        .set(bearer(owner))
        .expect(200);
      expect(JSON.stringify(list.body)).toContain('Promo de mayo');

      await http()
        .post('/campaigns')
        .set(bearer(owner))
        .send({ name: 'Canal raro', type: 'paloma-mensajera' })
        .expect(400);

      await http()
        .delete(`/campaigns/${campaign._id}`)
        .set(bearer(owner))
        .expect(200);
    });
  });

  describe('entradas públicas', () => {
    it('los webhooks rechazan un verify token incorrecto', async () => {
      for (const path of [
        '/wa/webhook/cloud',
        '/ig/webhook',
        '/messenger/webhook',
      ]) {
        const res = await http().get(path).query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'token-falso',
          'hub.challenge': 'reto-123',
        });
        expect(res.text).not.toContain('reto-123');
      }
    });

    it('los webhooks aceptan basura sin caerse', async () => {
      for (const path of [
        '/wa/webhook/cloud',
        '/ig/webhook',
        '/messenger/webhook',
      ])
        await http().post(path).send({ cualquier: 'cosa' }).expect(200);
      // La app sigue viva después de procesarla en segundo plano.
      await http().get('/').expect(200);
    });

    it('un enlace de baja inventado no da de baja a nadie', async () => {
      const page = await http().get('/u/token-inventado').expect(200);
      expect(page.text).toContain('Enlace no válido');
      const done = await http().post('/u/token-inventado').expect(200);
      expect(done.text).toContain('Enlace no válido');
    });

    it('un Host desconocido no se toma por dominio corto: sigue siendo la API', async () => {
      const res = await http()
        .get('/customers')
        .set('Host', 'no-es-dominio-corto.test');
      expect(res.status).toBe(401);
    });
  });

  describe('agentes IA: destinatarios de la derivación', () => {
    it('guarda destinatarios de WhatsApp, correo y SMS ya normalizados', async () => {
      const owner = await registerTenant(app);
      const account = '64b7f0c2a1b2c3d4e5f60718';

      const created = await http()
        .post('/ai-agents')
        .set(bearer(owner))
        .send({
          name: 'Ventas',
          systemPrompt: 'Atiende con amabilidad.',
          handoffEnabled: true,
          handoffTargets: [
            { channel: 'whatsapp', to: '+51 999 888 777', accountId: account },
            { channel: 'email', to: ' Jefa@Empresa.pe ' },
            { channel: 'sms', to: '51911111111', accountId: account },
            { channel: 'email', to: 'no-es-correo' },
          ],
        })
        .expect(201);
      const agent = created.body as Doc;
      expect(agent.handoffTargets).toEqual([
        { channel: 'whatsapp', to: '51999888777', accountId: account },
        { channel: 'email', to: 'jefa@empresa.pe' },
        { channel: 'sms', to: '51911111111' },
      ]);

      // Un PATCH que no toca la derivación conserva la lista.
      const renamed = await http()
        .patch(`/ai-agents/${agent._id}`)
        .set(bearer(owner))
        .send({ name: 'Ventas 2' })
        .expect(200);
      expect((renamed.body as Doc).handoffTargets).toHaveLength(3);

      const replaced = await http()
        .patch(`/ai-agents/${agent._id}`)
        .set(bearer(owner))
        .send({ handoffTargets: [{ channel: 'sms', to: '51922222222' }] })
        .expect(200);
      expect((replaced.body as Doc).handoffTargets).toEqual([
        { channel: 'sms', to: '51922222222' },
      ]);
    });

    it('rechaza un canal que no existe', async () => {
      const owner = await registerTenant(app);
      await http()
        .post('/ai-agents')
        .set(bearer(owner))
        .send({
          name: 'Ventas',
          systemPrompt: 'x',
          handoffTargets: [{ channel: 'telegram', to: '51999888777' }],
        })
        .expect(400);
    });
  });
});
